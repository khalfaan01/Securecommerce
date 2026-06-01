"""
Fraud Detection Model Training Script
Trains a Random Forest classifier for fraud detection
"""

import os
import pickle
from datetime import datetime
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)
import joblib

# =============================================
# Configuration
# =============================================

MODEL_OUTPUT_DIR = "./models"
MODEL_FILENAME = "fraud_model.pkl"
SCALER_FILENAME = "scaler.pkl"
ENCODER_FILENAME = "label_encoders.pkl"
METRICS_FILENAME = "model_metrics.pkl"

# Model parameters
RANDOM_STATE = 42
TEST_SIZE = 0.2
N_ESTIMATORS = 100
MAX_DEPTH = 15
MIN_SAMPLES_SPLIT = 10
MIN_SAMPLES_LEAF = 5

# =============================================
# Data Generation (Synthetic)
# =============================================

def generate_synthetic_data(n_samples: int = 10000) -> pd.DataFrame:
    """
    Generate synthetic fraud detection dataset
    """
    np.random.seed(RANDOM_STATE)
    
    data = {
        'transaction_amount': np.random.exponential(scale=150, size=n_samples),
        'item_count': np.random.randint(1, 20, n_samples),
        'user_recent_orders_24h': np.random.poisson(lam=2, size=n_samples),
        'user_total_orders': np.random.poisson(lam=15, size=n_samples),
        'account_age_days': np.random.exponential(scale=365, size=n_samples),
        'address_match': np.random.choice([0, 1], n_samples, p=[0.15, 0.85]),
        'hour_of_day': np.random.randint(0, 24, n_samples),
        'day_of_week': np.random.randint(0, 7, n_samples),
        'payment_method': np.random.choice(['card', 'paypal', 'stripe'], n_samples, p=[0.6, 0.3, 0.1]),
    }
    
    df = pd.DataFrame(data)
    
    # Engineer features
    df['amount_per_item'] = df['transaction_amount'] / df['item_count']
    df['is_high_risk_hour'] = df['hour_of_day'].apply(lambda x: 1 if 0 <= x <= 5 else 0)
    df['is_weekend'] = df['day_of_week'].apply(lambda x: 1 if x >= 5 else 0)
    df['order_velocity_flag'] = df['user_recent_orders_24h'].apply(lambda x: 1 if x > 5 else 0)
    
    # Generate fraud labels based on rules (for synthetic data)
    fraud_score = (
        (df['transaction_amount'] > df['transaction_amount'].quantile(0.9)).astype(int) * 3 +
        (df['user_recent_orders_24h'] > 8).astype(int) * 3 +
        (df['address_match'] == 0).astype(int) * 3 +
        (df['account_age_days'] < 7).astype(int) * 2 +
        (df['is_high_risk_hour'] == 1).astype(int) * 1 +
        (df['order_velocity_flag'] == 1).astype(int) * 2 +
        np.random.normal(0, 1, n_samples)
    )
    
    df['is_fraud'] = (fraud_score > 7).astype(int)
    
    # Ensure balanced dataset (adjust fraud ratio)
    fraud_count = df['is_fraud'].sum()
    print(f"Generated {fraud_count} fraud cases out of {n_samples} ({fraud_count/n_samples*100:.1f}%)")
    
    return df


# =============================================
# Data Preprocessing
# =============================================

def preprocess_data(df: pd.DataFrame) -> Tuple:
    """
    Preprocess data for training
    Returns X, y, scaler, encoders
    """
    # Encode categorical variables
    label_encoders = {}
    categorical_columns = ['payment_method']
    
    df_encoded = df.copy()
    
    for col in categorical_columns:
        le = LabelEncoder()
        df_encoded[f'{col}_encoded'] = le.fit_transform(df_encoded[col])
        label_encoders[col] = le
    
    # Feature columns
    feature_columns = [
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
    
    X = df_encoded[feature_columns].values
    y = df_encoded['is_fraud'].values
    
    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    return X_scaled, y, scaler, label_encoders, feature_columns


# =============================================
# Model Training
# =============================================

def train_model(X_train, y_train) -> RandomForestClassifier:
    """
    Train Random Forest model
    """
    model = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_split=MIN_SAMPLES_SPLIT,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        random_state=RANDOM_STATE,
        n_jobs=-1,
        class_weight='balanced',  # Handle class imbalance
    )
    
    model.fit(X_train, y_train)
    
    return model


def evaluate_model(model, X_test, y_test) -> dict:
    """
    Evaluate model performance
    """
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    
    metrics = {
        'accuracy': accuracy_score(y_test, y_pred),
        'precision': precision_score(y_test, y_pred),
        'recall': recall_score(y_test, y_pred),
        'f1_score': f1_score(y_test, y_pred),
        'roc_auc': roc_auc_score(y_test, y_pred_proba),
        'confusion_matrix': confusion_matrix(y_test, y_pred).tolist(),
        'classification_report': classification_report(y_test, y_pred),
        'training_date': datetime.now().isoformat(),
        'n_features': X_test.shape[1],
        'model_params': {
            'n_estimators': N_ESTIMATORS,
            'max_depth': MAX_DEPTH,
            'min_samples_split': MIN_SAMPLES_SPLIT,
            'min_samples_leaf': MIN_SAMPLES_LEAF,
        },
    }
    
    return metrics


# =============================================
# Feature Importance Analysis
# =============================================

def analyze_feature_importance(model, feature_columns: list) -> pd.DataFrame:
    """
    Analyze and display feature importance
    """
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    print("\n" + "="*60)
    print("FEATURE IMPORTANCE ANALYSIS")
    print("="*60)
    
    for i, idx in enumerate(indices):
        print(f"{i+1:2d}. {feature_columns[idx]:30s} - {importances[idx]:.4f}")
    
    print("="*60 + "\n")
    
    return pd.DataFrame({
        'feature': [feature_columns[i] for i in indices],
        'importance': [importances[i] for i in indices],
    })


# =============================================
# Save Model
# =============================================

def save_model(model, scaler, encoders, metrics, feature_columns):
    """
    Save trained model, preprocessors, and metrics
    """
    os.makedirs(MODEL_OUTPUT_DIR, exist_ok=True)
    
    # Save model
    model_path = os.path.join(MODEL_OUTPUT_DIR, MODEL_FILENAME)
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    print(f"✓ Model saved to {model_path}")
    
    # Save scaler
    scaler_path = os.path.join(MODEL_OUTPUT_DIR, SCALER_FILENAME)
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"✓ Scaler saved to {scaler_path}")
    
    # Save label encoders
    encoder_path = os.path.join(MODEL_OUTPUT_DIR, ENCODER_FILENAME)
    with open(encoder_path, 'wb') as f:
        pickle.dump(encoders, f)
    print(f"✓ Label encoders saved to {encoder_path}")
    
    # Save metrics
    metrics_path = os.path.join(MODEL_OUTPUT_DIR, METRICS_FILENAME)
    metrics['feature_columns'] = feature_columns
    with open(metrics_path, 'wb') as f:
        pickle.dump(metrics, f)
    print(f"✓ Model metrics saved to {metrics_path}")


# =============================================
# Main Training Pipeline
# =============================================

def main():
    """Main training pipeline"""
    print("="*60)
    print("FRAUD DETECTION MODEL TRAINING")
    print("="*60)
    
    # Generate synthetic data
    print("\n[1/6] Generating synthetic training data...")
    df = generate_synthetic_data(n_samples=50000)
    print(f"     Generated {len(df)} samples with {df['is_fraud'].sum()} fraud cases")
    
    # Preprocess data
    print("\n[2/6] Preprocessing data...")
    X, y, scaler, label_encoders, feature_columns = preprocess_data(df)
    print(f"     Feature matrix shape: {X.shape}")
    
    # Split data
    print("\n[3/6] Splitting data...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )
    print(f"     Training samples: {len(X_train)}")
    print(f"     Testing samples: {len(X_test)}")
    print(f"     Training fraud rate: {y_train.mean()*100:.1f}%")
    
    # Train model
    print("\n[4/6] Training Random Forest model...")
    model = train_model(X_train, y_train)
    print("     Model training complete")
    
    # Cross-validation
    print("\n     Performing cross-validation...")
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='roc_auc')
    print(f"     CV ROC-AUC scores: {cv_scores}")
    print(f"     Mean CV ROC-AUC: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")
    
    # Evaluate model
    print("\n[5/6] Evaluating model...")
    metrics = evaluate_model(model, X_test, y_test)
    
    print("\n" + "="*60)
    print("MODEL PERFORMANCE")
    print("="*60)
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall:    {metrics['recall']:.4f}")
    print(f"F1 Score:  {metrics['f1_score']:.4f}")
    print(f"ROC AUC:   {metrics['roc_auc']:.4f}")
    print("\nConfusion Matrix:")
    cm = np.array(metrics['confusion_matrix'])
    print(f"  TN: {cm[0][0]:5d}  FP: {cm[0][1]:5d}")
    print(f"  FN: {cm[1][0]:5d}  TP: {cm[1][1]:5d}")
    
    # Feature importance
    print("\n[6/6] Analyzing features...")
    importance_df = analyze_feature_importance(model, feature_columns)
    
    # Save model
    print("\nSaving model artifacts...")
    save_model(model, scaler, label_encoders, metrics, feature_columns)
    
    # Save test data for evaluation
    test_data = {
        'X': X_test,
        'y': y_test,
        'feature_names': feature_columns,
    }

    test_path = os.path.join(MODEL_OUTPUT_DIR, 'test_data.pkl')
    with open(test_path, 'wb') as f:
        pickle.dump(test_data, f)

    print(f"✓ Test data saved to {test_path}")

    print("\n" + "="*60)
    print("TRAINING COMPLETE!")
    print("="*60)
    print(f"\nModel saved to: {os.path.abspath(MODEL_OUTPUT_DIR)}")
    print("Ready for deployment!\n")


if __name__ == "__main__":
    main()