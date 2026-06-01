"""
Fraud Detection ML Inference Engine
Loads trained model and provides prediction interface
"""

import logging
import os
import pickle
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler

from app.schemas import FraudCheckRequest, FraudCheckResponse

logger = logging.getLogger(__name__)


class FraudInferenceEngine:
    """
    ML inference engine for fraud detection
    Supports both trained model and fallback heuristic scoring
    """
    
    def __init__(
        self,
        model_path: str = "./models/fraud_model.pkl",
        encoder_path: str = "./models/label_encoders.pkl",
        scaler_path: str = "./models/scaler.pkl",
        confidence_threshold: float = 0.7,
    ):
        self.model_path = model_path
        self.encoder_path = encoder_path
        self.scaler_path = scaler_path
        self.confidence_threshold = confidence_threshold
        
        self.model: Optional[RandomForestClassifier] = None
        self.scaler: Optional[StandardScaler] = None
        self.label_encoders: Dict[str, LabelEncoder] = {}
        self.is_model_loaded = False
        
        # Feature list matching training
        self.feature_columns = [
            'transaction_amount',
            'item_count',
            'user_recent_orders_24h',
            'user_total_orders',
            'account_age_days',
            'address_match',
            'hour_of_day',
            'day_of_week',
            'payment_method_encoded',
            'amount_per_item',
            'is_high_risk_hour',
            'is_weekend',
            'order_velocity_flag',
        ]
        
        # Model metadata
        self.model_version = "random_forest_v1"
        self.training_date = None
        
    def load_model(self) -> bool:
        """
        Load trained model and preprocessing objects from disk
        Falls back to heuristic mode if model files not found
        """
        try:
            if os.path.exists(self.model_path):
                with open(self.model_path, 'rb') as f:
                    self.model = pickle.load(f)
                logger.info(f"Model loaded from {self.model_path}")
            else:
                logger.warning(f"Model file not found: {self.model_path}")
                self.model = None
            
            if os.path.exists(self.scaler_path):
                with open(self.scaler_path, 'rb') as f:
                    self.scaler = pickle.load(f)
                logger.info(f"Scaler loaded from {self.scaler_path}")
            else:
                logger.warning(f"Scaler file not found: {self.scaler_path}")
                self.scaler = None
            
            if os.path.exists(self.encoder_path):
                with open(self.encoder_path, 'rb') as f:
                    self.label_encoders = pickle.load(f)
                logger.info(f"Label encoders loaded from {self.encoder_path}")
            else:
                logger.warning(f"Encoder file not found: {self.encoder_path}")
                self.label_encoders = {}
            
            self.is_model_loaded = (
                self.model is not None and 
                self.scaler is not None
            )
            
            if self.is_model_loaded:
                logger.info("ML model fully loaded and ready for inference")
                # Load model performance metrics if available
                metrics_path = os.path.join(os.path.dirname(self.model_path), 'model_metrics.pkl')
                if os.path.exists(metrics_path):
                    with open(metrics_path, 'rb') as f:
                        self.model_metrics = pickle.load(f)
                        self.training_date = self.model_metrics.get('training_date')
            else:
                logger.warning("Running in heuristic fallback mode")
            
            return self.is_model_loaded
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.is_model_loaded = False
            return False
    
    async def predict(self, request: FraudCheckRequest) -> FraudCheckResponse:
        """
        Generate fraud prediction for a transaction
        Uses ML model if available, otherwise heuristic rules
        """
        if self.is_model_loaded:
            return await self._predict_with_model(request)
        else:
            return await self._predict_heuristic(request)
    
    async def _predict_with_model(self, request: FraudCheckRequest) -> FraudCheckResponse:
        """
        Use trained Random Forest model for prediction
        """
        try:
            # Extract and engineer features
            features = self._extract_features(request)
            
            # Scale features
            if self.scaler:
                features_scaled = self.scaler.transform([features])
            else:
                features_scaled = [features]
            
            # Get prediction probability
            if self.model:
                fraud_probability = self.model.predict_proba(features_scaled)[0][1]
            else:
                fraud_probability = 0.5
            
            # Get feature importance for reasoning
            reasons = self._generate_reasons(features, fraud_probability)
            
            # Determine risk level
            risk_level = self._determine_risk_level(fraud_probability)
            
            # Determine required action
            required_action = self._determine_action(fraud_probability)
            
            return FraudCheckResponse(
                transactionId=request.transactionId,
                riskScore=round(float(fraud_probability), 4),
                riskLevel=risk_level,
                isFraudulent=fraud_probability >= self.confidence_threshold,
                reasons=reasons,
                model=f"{self.model_version}_ml",
                requiredAction=required_action,
                processedAt=datetime.utcnow(),
            )
            
        except Exception as e:
            logger.error(f"ML prediction error: {e}, falling back to heuristic")
            return await self._predict_heuristic(request)
    
    async def _predict_heuristic(self, request: FraudCheckRequest) -> FraudCheckResponse:
        """
        Heuristic-based fraud detection (fallback when model unavailable)
        """
        # Extract data
        amount = request.orderData.amount
        item_count = request.orderData.itemCount
        recent_orders = request.userData.recentOrders
        account_age = request.userData.accountAge or 0
        address_match = request.userData.addressMatch
        hour = request.metadata.hourOfDay
        
        # Calculate risk score
        risk_score = 0.0
        reasons = []
        
        # 1. High transaction amount
        if amount > 1000:
            risk_score += 0.2
            reasons.append(f"High transaction amount: ${amount:.2f}")
        elif amount > 500:
            risk_score += 0.1
            reasons.append(f"Above average transaction amount: ${amount:.2f}")
        
        # 2. Order velocity (rapid orders)
        if recent_orders > 10:
            risk_score += 0.25
            reasons.append(f"Very high order velocity: {recent_orders} orders in 24h")
        elif recent_orders > 5:
            risk_score += 0.15
            reasons.append(f"High order velocity: {recent_orders} orders in 24h")
        elif recent_orders > 3:
            risk_score += 0.05
            reasons.append(f"Above normal order frequency: {recent_orders} orders")
        
        # 3. New account with large order
        if account_age < 7 and amount > 200:
            risk_score += 0.2
            reasons.append(f"New account ({account_age}d) with large order")
        elif account_age < 30 and amount > 500:
            risk_score += 0.15
            reasons.append(f"Relatively new account ({account_age}d) with high-value order")
        
        # 4. Address mismatch
        if not address_match:
            risk_score += 0.2
            reasons.append("Shipping and billing address mismatch")
        
        # 5. Unusual hours (midnight - 5am)
        if 0 <= hour <= 5:
            risk_score += 0.1
            reasons.append(f"Transaction during unusual hours: {hour}:00")
        
        # 6. Multiple items with high total
        if item_count > 5 and amount > 1000:
            risk_score += 0.1
            reasons.append(f"Large order: {item_count} items totaling ${amount:.2f}")
        
        # 7. Very high amount (outlier)
        if amount > 5000:
            risk_score += 0.25
            reasons.append(f"Extremely high transaction amount: ${amount:.2f}")
        
        # 8. Account age suspicious patterns
        if account_age < 1:
            risk_score += 0.15
            reasons.append("Account created today")
        
        # Cap risk score at 1.0
        risk_score = min(risk_score, 1.0)
        
        # Determine risk level
        risk_level = self._determine_risk_level(risk_score)
        
        # Determine required action
        required_action = self._determine_action(risk_score)
        
        return FraudCheckResponse(
            transactionId=request.transactionId,
            riskScore=round(risk_score, 4),
            riskLevel=risk_level,
            isFraudulent=risk_score >= self.confidence_threshold,
            reasons=reasons if reasons else ["No suspicious patterns detected"],
            model=f"{self.model_version}_heuristic",
            requiredAction=required_action,
            processedAt=datetime.utcnow(),
        )
    
    def _extract_features(self, request: FraudCheckRequest) -> List[float]:
        """
        Extract and engineer features from request for ML model
        """
        # Encode payment method
        payment_method = request.orderData.paymentMethod
        if payment_method in self.label_encoders.get('payment_method', {}):
            payment_encoded = self.label_encoders['payment_method'].transform([payment_method])[0]
        else:
            # Fallback encoding
            payment_map = {'card': 0, 'paypal': 1, 'stripe': 2}
            payment_encoded = payment_map.get(payment_method, 0)
        
        # Engineer features
        amount_per_item = request.orderData.amount / request.orderData.itemCount
        is_high_risk_hour = 1 if 0 <= request.metadata.hourOfDay <= 5 else 0
        is_weekend = 1 if request.metadata.dayOfWeek >= 5 else 0
        order_velocity_flag = 1 if request.userData.recentOrders > 5 else 0
        
        features = [
            request.orderData.amount,
            request.orderData.itemCount,
            request.userData.recentOrders,
            request.userData.totalOrders,
            request.userData.accountAge or 0,
            int(request.userData.addressMatch),
            request.metadata.hourOfDay,
            request.metadata.dayOfWeek,
            payment_encoded,
            amount_per_item,
            is_high_risk_hour,
            is_weekend,
            order_velocity_flag,
        ]
        
        return features
    
    def _determine_risk_level(self, risk_score: float) -> str:
        """Map risk score to risk level"""
        if risk_score >= 0.8:
            return "critical"
        elif risk_score >= 0.6:
            return "high"
        elif risk_score >= 0.4:
            return "medium"
        else:
            return "low"
    
    def _determine_action(self, risk_score: float) -> str:
        """Determine required action based on risk score"""
        if risk_score >= 0.8:
            return "auto_reject"
        elif risk_score >= self.confidence_threshold:
            return "manual_review"
        else:
            return "allow"
    
    def _generate_reasons(self, features: List[float], fraud_probability: float) -> List[str]:
        """
        Generate human-readable reasons for fraud prediction
        Uses feature importance from trained model
        """
        reasons = []
        
        # Feature indices
        AMOUNT_IDX = 0
        ITEM_COUNT_IDX = 1
        RECENT_ORDERS_IDX = 2
        ACCOUNT_AGE_IDX = 4
        ADDRESS_MATCH_IDX = 5
        HOUR_IDX = 6
        
        if fraud_probability < self.confidence_threshold:
            return ["Low risk transaction"]
        
        # Add reasons based on feature values
        if features[AMOUNT_IDX] > 1000:
            reasons.append(f"High transaction amount: ${features[AMOUNT_IDX]:.2f}")
        
        if features[RECENT_ORDERS_IDX] > 5:
            reasons.append(f"High order velocity: {features[RECENT_ORDERS_IDX]} recent orders")
        
        if features[ACCOUNT_AGE_IDX] < 7:
            reasons.append(f"New account: {features[ACCOUNT_AGE_IDX]:.0f} days old")
        
        if not features[ADDRESS_MATCH_IDX]:
            reasons.append("Billing/shipping address mismatch")
        
        if features[HOUR_IDX] <= 5:
            reasons.append(f"Unusual transaction hour: {features[HOUR_IDX]:.0f}:00")
        
        if not reasons:
            reasons.append("Pattern anomaly detected by ML model")
        
        return reasons
    
    def get_model_info(self) -> dict:
        """
        Get information about the loaded model
        """
        return {
            "modelType": self.model_version,
            "modelVersion": "1.0.0",
            "features": self.feature_columns,
            "isLoaded": self.is_model_loaded,
            "lastTrainingDate": self.training_date or "unknown",
            "performance": getattr(self, 'model_metrics', None),
            "threshold": self.confidence_threshold,
        }