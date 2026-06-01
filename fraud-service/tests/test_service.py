"""
Test suite for fraud detection service
"""

import asyncio
import json
import pytest
from datetime import datetime
from unittest.mock import Mock, patch

from app.main import app
from app.schemas import FraudCheckRequest, FraudCheckResponse
from app.inference import FraudInferenceEngine
from fastapi.testclient import TestClient

client = TestClient(app)


# =============================================
# Test Fixtures
# =============================================

@pytest.fixture
def valid_fraud_request():
    """Create a valid fraud check request for testing"""
    return {
        "transactionId": "TXN-TEST-001",
        "orderData": {
            "orderId": "ORD-TEST-001",
            "userId": "user_123",
            "amount": 299.99,
            "itemCount": 3,
            "shippingAddress": {
                "fullName": "John Doe",
                "street": "123 Main St",
                "city": "New York",
                "state": "NY",
                "zipCode": "10001",
                "country": "US"
            },
            "billingAddress": {
                "fullName": "John Doe",
                "street": "123 Main St",
                "city": "New York",
                "state": "NY",
                "zipCode": "10001",
                "country": "US"
            },
            "paymentMethod": "card"
        },
        "userData": {
            "userId": "user_123",
            "age": 25,
            "accountAge": 365,
            "recentOrders": 2,
            "totalOrders": 15,
            "addressMatch": True
        },
        "metadata": {
            "timestamp": datetime.utcnow().isoformat(),
            "ipAddress": "192.168.1.1",
            "userAgent": "Mozilla/5.0",
            "hourOfDay": 10,
            "dayOfWeek": 1
        }
    }

@pytest.fixture
def suspicious_request():
    """Create a suspicious transaction for testing"""
    return {
        "transactionId": "TXN-TEST-002",
        "orderData": {
            "orderId": "ORD-TEST-002",
            "userId": "new_user",
            "amount": 2500.00,
            "itemCount": 8,
            "shippingAddress": {
                "fullName": "Suspicious User",
                "street": "456 Different St",
                "city": "Miami",
                "state": "FL",
                "zipCode": "33101",
                "country": "US"
            },
            "billingAddress": {
                "fullName": "Suspicious User",
                "street": "789 Billing Ave",
                "city": "New York",
                "state": "NY",
                "zipCode": "10001",
                "country": "US"
            },
            "paymentMethod": "card"
        },
        "userData": {
            "userId": "new_user",
            "age": 22,
            "accountAge": 2,
            "recentOrders": 12,
            "totalOrders": 14,
            "addressMatch": False
        },
        "metadata": {
            "timestamp": datetime.utcnow().isoformat(),
            "ipAddress": "10.0.0.1",
            "userAgent": "Mozilla/5.0",
            "hourOfDay": 3,
            "dayOfWeek": 5
        }
    }


# =============================================
# Test Health Endpoint
# =============================================

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    
    data = response.json()
    assert data["service"] == "fraud-detection"
    assert "status" in data
    assert "modelLoaded" in data
    assert "redisConnected" in data


# =============================================
# Test Prediction Endpoint
# =============================================

def test_predict_valid_transaction(valid_fraud_request):
    """Test prediction with valid transaction"""
    response = client.post("/predict", json=valid_fraud_request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["transactionId"] == "TXN-TEST-001"
    assert 0 <= data["riskScore"] <= 1
    assert data["riskLevel"] in ["low", "medium", "high", "critical"]
    assert data["requiredAction"] in ["allow", "manual_review", "auto_reject"]
    assert len(data["reasons"]) > 0


def test_predict_suspicious_transaction(suspicious_request):
    """Test prediction with suspicious transaction"""
    response = client.post("/predict", json=suspicious_request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["transactionId"] == "TXN-TEST-002"
    
    # Suspicious transaction should have higher risk
    assert data["riskScore"] > 0.3, f"Expected high risk, got {data['riskScore']}"
    assert data["riskLevel"] in ["high", "critical"]


def test_predict_invalid_request():
    """Test prediction with invalid request"""
    response = client.post("/predict", json={"invalid": "data"})
    assert response.status_code == 422  # Validation error


# =============================================
# Test Batch Prediction
# =============================================

def test_batch_predict(valid_fraud_request, suspicious_request):
    """Test batch prediction"""
    batch = [valid_fraud_request, suspicious_request]
    response = client.post("/predict/batch", json=batch)
    assert response.status_code == 200
    
    data = response.json()
    predictions = data["predictions"]
    assert len(predictions) == 2
    
    # First transaction should be lower risk than second
    assert predictions[0]["riskScore"] < predictions[1]["riskScore"]


# =============================================
# Test Schema Validation
# =============================================

def test_address_validation():
    """Test address schema validation"""
    invalid_address = {
        "fullName": "Test User",
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zipCode": "invalid",
        "country": "US"
    }
    
    with pytest.raises(ValueError):
        from app.schemas import Address
        Address(**invalid_address)


def test_fraud_request_validation():
    """Test fraud request schema validation"""
    from app.schemas import FraudCheckRequest
    
    invalid_request = {
        "transactionId": "TXN-001",
        # Missing orderData
        "userData": {
            "userId": "user_123",
            "recentOrders": 2,
            "totalOrders": 15,
            "addressMatch": True
        }
    }
    
    with pytest.raises(ValueError):
        FraudCheckRequest(**invalid_request)


# =============================================
# Test Inference Engine
# =============================================

@pytest.mark.asyncio
async def test_heuristic_prediction(valid_fraud_request):
    """Test heuristic prediction engine"""
    from app.schemas import FraudCheckRequest as RequestSchema
    
    engine = FraudInferenceEngine()
    engine.is_model_loaded = False
    
    request = RequestSchema(**valid_fraud_request)
    result = await engine._predict_heuristic(request)
    
    assert isinstance(result, FraudCheckResponse)
    assert result.transactionId == "TXN-TEST-001"
    assert 0 <= result.riskScore <= 1
    assert result.model == "random_forest_v1_heuristic"


@pytest.mark.asyncio
async def test_feature_extraction(valid_fraud_request):
    """Test feature extraction"""
    from app.schemas import FraudCheckRequest as RequestSchema
    
    engine = FraudInferenceEngine()
    request = RequestSchema(**valid_fraud_request)
    
    features = engine._extract_features(request)
    
    assert len(features) == 13  # Number of features
    assert all(isinstance(f, (int, float)) for f in features)


# =============================================
# Test Risk Level Determination
# =============================================

def test_risk_level_mapping():
    """Test risk score to risk level mapping"""
    engine = FraudInferenceEngine()
    
    assert engine._determine_risk_level(0.1) == "low"
    assert engine._determine_risk_level(0.4) == "medium"
    assert engine._determine_risk_level(0.6) == "high"
    assert engine._determine_risk_level(0.8) == "critical"


def test_action_determination():
    """Test required action determination"""
    engine = FraudInferenceEngine(confidence_threshold=0.7)
    
    assert engine._determine_action(0.2) == "allow"
    assert engine._determine_action(0.75) == "manual_review"
    assert engine._determine_action(0.9) == "auto_reject"


# =============================================
# Integration Test (Mocked Redis)
# =============================================

@pytest.mark.asyncio
@patch('app.main.redis.Redis')
async def test_redis_integration(mock_redis):
    """Test Redis integration (mocked)"""
    mock_redis.return_value.ping = Mock(return_value=True)
    mock_redis.return_value.publish = Mock(return_value=1)
    
    # Test connection
    from app.main import connect_redis
    await connect_redis()
    
    assert service_health["redis_connected"] == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])