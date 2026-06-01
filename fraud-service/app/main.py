"""
Fraud Detection Microservice - Main Application
FastAPI server with Redis pub/sub for real-time fraud scoring
"""

import asyncio
import json
import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import redis.asyncio as redis
import numpy as np
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.inference import FraudInferenceEngine
from app.schemas import (
    FraudCheckRequest,
    FraudCheckResponse,
    HealthCheckResponse,
    ModelInfo,
)

# =============================================
# Configuration
# =============================================

class Config:
    """Application configuration from environment variables"""
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    
    # Pub/Sub channels
    FRAUD_CHECK_CHANNEL: str = os.getenv("FRAUD_CHECK_CHANNEL", "fraud_check")
    FRAUD_RESPONSE_CHANNEL: str = os.getenv("FRAUD_RESPONSE_CHANNEL", "fraud_response")
    
    # ML Model
    MODEL_PATH: str = os.getenv("MODEL_PATH", "./models/fraud_model.pkl")
    ENCODER_PATH: str = os.getenv("ENCODER_PATH", "./models/label_encoders.pkl")
    SCALER_PATH: str = os.getenv("SCALER_PATH", "./models/scaler.pkl")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    
    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "100"))

config = Config()

# =============================================
# Logging Setup
# =============================================

logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)

logger = logging.getLogger("fraud-service")

# =============================================
# Initialize Services
# =============================================

# ML Inference Engine
inference_engine = FraudInferenceEngine(
    model_path=config.MODEL_PATH,
    encoder_path=config.ENCODER_PATH,
    scaler_path=config.SCALER_PATH,
    confidence_threshold=config.CONFIDENCE_THRESHOLD,
)

# Redis clients
redis_publisher: Optional[redis.Redis] = None
redis_subscriber: Optional[redis.Redis] = None

# Service health status
service_health = {
    "status": "starting",
    "model_loaded": False,
    "redis_connected": False,
    "predictions_processed": 0,
    "fraud_detected": 0,
    "errors": 0,
    "start_time": datetime.utcnow(),
}

# =============================================
# Application Lifecycle
# =============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle application startup and shutdown
    """
    # Startup
    logger.info("Starting Fraud Detection Service...")
    
    # Load ML model
    try:
        inference_engine.load_model()
        service_health["model_loaded"] = True
        service_health["status"] = "healthy"
        logger.info("ML model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ML model: {e}")
        service_health["status"] = "degraded"
        # Continue without model - will use fallback scoring
    
    # Connect to Redis
    await connect_redis()
    
    # Start Redis subscriber in background
    asyncio.create_task(subscribe_to_fraud_checks())
    
    logger.info("Fraud Detection Service started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Fraud Detection Service...")
    await disconnect_redis()
    logger.info("Fraud Detection Service stopped")

async def connect_redis():
    """Establish Redis connections"""
    global redis_publisher, redis_subscriber
    
    try:
        redis_config = {
            "host": config.REDIS_HOST,
            "port": config.REDIS_PORT,
            "password": config.REDIS_PASSWORD if config.REDIS_PASSWORD else None,
            "decode_responses": True,
            "retry_on_timeout": True,
            "max_connections": 10,
        }
        
        # Publisher connection
        redis_publisher = redis.Redis(**redis_config)
        await redis_publisher.ping()
        
        # Subscriber connection (separate for pub/sub)
        redis_subscriber = redis.Redis(**redis_config)
        await redis_subscriber.ping()
        
        service_health["redis_connected"] = True
        logger.info("Redis connections established")
        
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        service_health["redis_connected"] = False
        # Service can still handle HTTP requests without Redis

async def disconnect_redis():
    """Close Redis connections"""
    global redis_publisher, redis_subscriber
    
    try:
        if redis_publisher:
            await redis_publisher.close()
        if redis_subscriber:
            await redis_subscriber.close()
        logger.info("Redis connections closed")
    except Exception as e:
        logger.error(f"Error closing Redis connections: {e}")

async def subscribe_to_fraud_checks():
    """
    Subscribe to fraud check requests via Redis pub/sub
    Runs continuously in background
    """
    if not redis_subscriber or not service_health["redis_connected"]:
        logger.warning("Redis not connected, skipping pub/sub subscription")
        return
    
    try:
        pubsub = redis_subscriber.pubsub()
        await pubsub.subscribe(config.FRAUD_CHECK_CHANNEL)
        
        logger.info(f"Subscribed to {config.FRAUD_CHECK_CHANNEL}")
        
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await process_fraud_check(data)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON in pub/sub message: {message['data'][:100]}")
                except Exception as e:
                    logger.error(f"Error processing pub/sub message: {e}")
                    service_health["errors"] += 1
                    
    except asyncio.CancelledError:
        logger.info("Pub/sub subscription cancelled")
    except Exception as e:
        logger.error(f"Pub/sub subscription error: {e}")
        service_health["redis_connected"] = False

async def process_fraud_check(data: dict):
    """
    Process incoming fraud check request from Redis pub/sub
    """
    request_id = data.get("transactionId", "unknown")
    
    try:
        logger.debug(f"Processing fraud check: {request_id}")
        
        # Validate request
        request = FraudCheckRequest(**data)
        
        # Run inference
        result = await inference_engine.predict(request)
        
        # Publish response
        if redis_publisher and service_health["redis_connected"]:
            response_json = result.model_dump_json()
            await redis_publisher.publish(
                config.FRAUD_RESPONSE_CHANNEL,
                response_json
            )
            
            # Update metrics
            service_health["predictions_processed"] += 1
            if result.isFraudulent:
                service_health["fraud_detected"] += 1
                
            logger.info(
                f"Fraud check complete: {request_id} | "
                f"Risk: {result.riskScore:.2f} | "
                f"Fraud: {result.isFraudulent}"
            )
        else:
            logger.error("Redis publisher not available for response")
            
    except Exception as e:
        logger.error(f"Failed to process fraud check {request_id}: {e}")
        service_health["errors"] += 1
        
        # Send error response
        error_response = FraudCheckResponse(
            transactionId=request_id,
            riskScore=0.5,  # Neutral score on error
            riskLevel="medium",
            isFraudulent=False,
            reasons=["Error processing fraud check"],
            model="error_fallback",
            requiredAction="manual_review",
            processedAt=datetime.utcnow(),
        )
        
        if redis_publisher and service_health["redis_connected"]:
            await redis_publisher.publish(
                config.FRAUD_RESPONSE_CHANNEL,
                error_response.model_dump_json()
            )

# =============================================
# FastAPI Application
# =============================================

app = FastAPI(
    title="SecureCommerce Fraud Detection Service",
    description="ML-powered fraud detection microservice for e-commerce transactions",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware (internal service, allow all)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================
# Request Rate Limiting
# =============================================

from fastapi import Request
from datetime import timedelta

request_counts: dict[str, list] = {}

async def rate_limit_check(request: Request):
    """Simple in-memory rate limiter"""
    client_ip = request.client.host
    
    current_time = datetime.utcnow()
    minute_ago = current_time - timedelta(minutes=1)
    
    if client_ip not in request_counts:
        request_counts[client_ip] = []
    
    # Clean old requests
    request_counts[client_ip] = [
        t for t in request_counts[client_ip] if t > minute_ago
    ]
    
    # Check rate limit
    if len(request_counts[client_ip]) >= config.MAX_REQUESTS_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
    
    # Record request
    request_counts[client_ip].append(current_time)

# =============================================
# API Endpoints
# =============================================

@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """
    Health check endpoint for orchestrator/monitoring
    """
    return HealthCheckResponse(
        status=service_health["status"],
        service="fraud-detection",
        version="1.0.0",
        modelLoaded=service_health["model_loaded"],
        redisConnected=service_health["redis_connected"],
        uptime=str(datetime.utcnow() - service_health["start_time"]),
        metrics={
            "predictions_processed": service_health["predictions_processed"],
            "fraud_detected": service_health["fraud_detected"],
            "errors": service_health["errors"],
        },
    )

@app.get("/model/info", response_model=ModelInfo)
async def model_info():
    """
    Get information about the loaded ML model
    """
    return inference_engine.get_model_info()

@app.post("/predict", response_model=FraudCheckResponse)
async def predict_sync(request: FraudCheckRequest, req: Request):
    """
    Synchronous fraud prediction endpoint (HTTP)
    Used for direct API calls or testing
    """
    # Apply rate limiting
    await rate_limit_check(req)
    
    try:
        result = await inference_engine.predict(request)
        
        # Update metrics
        service_health["predictions_processed"] += 1
        if result.isFraudulent:
            service_health["fraud_detected"] += 1
        
        return result
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        service_health["errors"] += 1
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )

@app.post("/predict/batch")
async def predict_batch(requests: list[FraudCheckRequest], req: Request):
    """
    Batch fraud prediction endpoint
    """
    await rate_limit_check(req)
    
    try:
        results = []
        for request in requests:
            result = await inference_engine.predict(request)
            results.append(result)
            
            if result.isFraudulent:
                service_health["fraud_detected"] += 1
        
        service_health["predictions_processed"] += len(requests)
        
        return {"predictions": [r.model_dump() for r in results]}
        
    except Exception as e:
        logger.error(f"Batch prediction error: {e}")
        service_health["errors"] += 1
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch prediction failed: {str(e)}"
        )

@app.post("/admin/reload-model")
async def reload_model():
    """
    Reload ML model without restarting service
    """
    try:
        inference_engine.load_model()
        service_health["model_loaded"] = True
        service_health["status"] = "healthy"
        return {"status": "success", "message": "Model reloaded successfully"}
    except Exception as e:
        service_health["model_loaded"] = False
        service_health["status"] = "degraded"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reload model: {str(e)}"
        )

# =============================================
# Graceful Shutdown
# =============================================

def handle_shutdown(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received shutdown signal {signum}")
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

# =============================================
# Main Entry Point
# =============================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.DEBUG,
        log_level="debug" if config.DEBUG else "info",
    )