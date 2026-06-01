"""
Pydantic schemas for fraud detection service
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, validator
import re


# =============================================
# Address Schema
# =============================================

class Address(BaseModel):
    """Shipping/Billing address"""
    fullName: str = Field(..., min_length=1, max_length=100)
    street: str = Field(..., min_length=1, max_length=200)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    zipCode: str = Field(..., min_length=5, max_length=10)
    country: str = Field(default="US", min_length=1, max_length=100)
    phone: Optional[str] = None
    
    @validator('zipCode')
    def validate_zip(cls, v):
        """Validate ZIP code format"""
        if not re.match(r'^\d{5}(-\d{4})?$', v):
            raise ValueError('Invalid ZIP code format')
        return v


# =============================================
# Order Data Schema
# =============================================

class OrderData(BaseModel):
    """Order information for fraud check"""
    orderId: str = Field(..., min_length=1)
    userId: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    itemCount: int = Field(..., ge=1)
    shippingAddress: Address
    billingAddress: Address
    paymentMethod: str = Field(..., pattern="^(card|paypal|stripe)$")


# =============================================
# User Data Schema
# =============================================

class UserData(BaseModel):
    """User information for fraud analysis"""
    userId: str = Field(..., min_length=1)
    age: Optional[int] = Field(default=None, ge=0)
    accountAge: Optional[int] = Field(default=None, ge=0)  # Days since account creation
    recentOrders: int = Field(default=0, ge=0)
    totalOrders: int = Field(default=0, ge=0)
    addressMatch: bool = Field(default=True)


# =============================================
# Metadata Schema
# =============================================

class TransactionMetadata(BaseModel):
    """Transaction metadata"""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ipAddress: str = Field(..., min_length=1)
    userAgent: str = Field(default="unknown")
    hourOfDay: int = Field(default=0, ge=0, le=23)
    dayOfWeek: int = Field(default=0, ge=0, le=6)
    
    @validator('hourOfDay')
    def validate_hour(cls, v):
        """Ensure hour is valid"""
        if not 0 <= v <= 23:
            # Infer from current time if invalid
            return datetime.utcnow().hour
        return v


# =============================================
# Fraud Check Request Schema
# =============================================

class FraudCheckRequest(BaseModel):
    """
    Complete fraud check request from Node.js backend
    """
    transactionId: str = Field(..., min_length=1)
    orderData: OrderData
    userData: UserData
    metadata: TransactionMetadata = Field(default_factory=TransactionMetadata)
    
    class Config:
        json_schema_extra = {
            "example": {
                "transactionId": "TXN-1234567890",
                "orderData": {
                    "orderId": "ORD-12345",
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
                    "timestamp": "2024-01-15T10:30:00Z",
                    "ipAddress": "192.168.1.1",
                    "userAgent": "Mozilla/5.0",
                    "hourOfDay": 10,
                    "dayOfWeek": 1
                }
            }
        }


# =============================================
# Fraud Check Response Schema
# =============================================

class FraudCheckResponse(BaseModel):
    """
    Fraud detection result
    """
    transactionId: str
    riskScore: float = Field(..., ge=0.0, le=1.0)
    riskLevel: str = Field(..., pattern="^(low|medium|high|critical)$")
    isFraudulent: bool
    reasons: List[str] = Field(default_factory=list)
    model: str = Field(default="unknown")
    requiredAction: str = Field(..., pattern="^(allow|manual_review|auto_reject)$")
    processedAt: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "transactionId": "TXN-1234567890",
                "riskScore": 0.85,
                "riskLevel": "high",
                "isFraudulent": True,
                "reasons": [
                    "High order velocity",
                    "Address mismatch detected",
                    "Transaction amount above threshold"
                ],
                "model": "random_forest_v1",
                "requiredAction": "auto_reject",
                "processedAt": "2024-01-15T10:30:05Z"
            }
        }


# =============================================
# Health Check Schema
# =============================================

class HealthCheckResponse(BaseModel):
    """Service health status"""
    status: str
    service: str
    version: str
    modelLoaded: bool
    redisConnected: bool
    uptime: str
    metrics: dict


# =============================================
# Model Info Schema
# =============================================

class ModelInfo(BaseModel):
    """ML model information"""
    modelType: str
    modelVersion: str
    features: List[str]
    isLoaded: bool
    lastTrainingDate: Optional[str] = None
    performance: Optional[dict] = None
    threshold: float