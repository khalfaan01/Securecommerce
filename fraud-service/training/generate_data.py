"""
Synthetic Data Generation for Fraud Detection Training
Generates realistic e-commerce transaction data with fraud labels
"""

import os
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Tuple, Dict

# =============================================
# Configuration
# =============================================

OUTPUT_DIR = "./models"
DATA_FILENAME = "synthetic_fraud_data.csv"
TRAIN_FILENAME = "train_data.pkl"
TEST_FILENAME = "test_data.pkl"

RANDOM_SEED = 42
N_SAMPLES = 50000
FRAUD_RATIO = 0.05  # 5% fraud rate
TEST_SIZE = 0.2

np.random.seed(RANDOM_SEED)

# =============================================
# Data Generation Functions
# =============================================

def generate_user_data(n_users: int) -> pd.DataFrame:
    """
    Generate synthetic user profiles
    """
    user_ids = [f"user_{i:05d}" for i in range(1, n_users + 1)]
    
    return pd.DataFrame({
        'user_id': user_ids,
        'account_age_days': np.random.exponential(scale=365, size=n_users).astype(int),
        'is_verified': np.random.choice([True, False], n_users, p=[0.8, 0.2]),
        'has_mfa': np.random.choice([True, False], n_users, p=[0.6, 0.4]),
        'country': np.random.choice(['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR'], n_users,
                                    p=[0.4, 0.15, 0.1, 0.08, 0.07, 0.07, 0.05, 0.08]),
        'device_type': np.random.choice(['mobile', 'desktop', 'tablet'], n_users, p=[0.5, 0.4, 0.1]),
    })


def generate_transactions(
    user_profiles: pd.DataFrame,
    n_transactions: int
) -> pd.DataFrame:
    """
    Generate synthetic transaction data
    """
    n_users = len(user_profiles)
    
    transactions = pd.DataFrame({
        'transaction_id': [f"TXN-{i:07d}" for i in range(1, n_transactions + 1)],
        'user_id': np.random.choice(user_profiles['user_id'], n_transactions),
        'timestamp': [
            datetime.now() - timedelta(
                days=np.random.randint(0, 365),
                hours=np.random.randint(0, 24),
                minutes=np.random.randint(0, 60)
            )
            for _ in range(n_transactions)
        ],
        'amount': np.random.lognormal(mean=4.5, sigma=0.8, size=n_transactions),
        'item_count': np.random.randint(1, 20, n_transactions),
        'payment_method': np.random.choice(['card', 'paypal', 'stripe'], n_transactions, 
                                           p=[0.60, 0.25, 0.15]),
        'device_type': np.random.choice(['mobile', 'desktop', 'tablet'], n_transactions, 
                                        p=[0.5, 0.4, 0.1]),
    })
    
    # Merge with user profiles
    transactions = transactions.merge(
        user_profiles, 
        on='user_id', 
        how='left',
        suffixes=('_txn', '_user')
        )
    
    # Derive additional features
    transactions['hour_of_day'] = transactions['timestamp'].dt.hour
    transactions['day_of_week'] = transactions['timestamp'].dt.dayofweek
    transactions['is_weekend'] = transactions['day_of_week'].isin([5, 6]).astype(int)
    transactions['is_night'] = ((transactions['hour_of_day'] >= 0) & 
                                (transactions['hour_of_day'] <= 5)).astype(int)
    
    # Address match (85% match rate)
    transactions['address_match'] = np.random.choice([0, 1], n_transactions, p=[0.15, 0.85])
    
    # Order velocity (number of orders in last 24 hours)
    transactions = transactions.sort_values('timestamp')
    transactions['orders_last_24h'] = 0
    
    for i in range(n_transactions):
        user_id = transactions.iloc[i]['user_id']
        ts = transactions.iloc[i]['timestamp']
        cutoff = ts - timedelta(hours=24)
        
        count = len(transactions[
            (transactions['user_id'] == user_id) &
            (transactions['timestamp'] >= cutoff) &
            (transactions['timestamp'] <= ts)
        ])
        transactions.iloc[i, transactions.columns.get_loc('orders_last_24h')] = count
    
    # Total orders per user
    order_counts = transactions.groupby('user_id').size().reset_index(name='total_orders')
    transactions = transactions.merge(order_counts, on='user_id', how='left')
    
    return transactions


def generate_fraud_labels(transactions: pd.DataFrame) -> pd.Series:
    """
    Generate fraud labels based on realistic fraud patterns
    """
    n = len(transactions)
    fraud_scores = np.zeros(n)
    
    # Pattern 1: High amount transactions (20% contribution)
    high_amount_threshold = transactions['amount'].quantile(0.95)
    fraud_scores += (transactions['amount'] > high_amount_threshold).astype(float) * 0.2
    
    # Pattern 2: High order velocity (25% contribution)
    fraud_scores += (transactions['orders_last_24h'] > 5).astype(float) * 0.25
    
    # Pattern 3: Address mismatch (20% contribution)
    fraud_scores += (transactions['address_match'] == 0).astype(float) * 0.2
    
    # Pattern 4: New account with high amount (15% contribution)
    fraud_scores += ((transactions['account_age_days'] < 7) & 
                     (transactions['amount'] > 500)).astype(float) * 0.15
    
    # Pattern 5: Night hours (10% contribution)
    fraud_scores += transactions['is_night'].astype(float) * 0.1
    
    # Pattern 6: Multiple devices (10% contribution)
    device_changes = transactions.groupby('user_id')['device_type_txn'].transform(
    lambda x: x.nunique()
    )
    fraud_scores += (device_changes > 1).astype(float) * 0.1
    
    # Add some randomness
    fraud_scores += np.random.normal(0, 0.05, n)
    
    # Normalize scores to 0-1 range
    fraud_scores = (fraud_scores - fraud_scores.min()) / (fraud_scores.max() - fraud_scores.min())
    
    # Label based on threshold to achieve target fraud ratio
    threshold = np.percentile(fraud_scores, 100 * (1 - FRAUD_RATIO))
    labels = (fraud_scores >= threshold).astype(int)
    
    return labels


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Feature engineering for ML model
    """
    # Create copy to avoid modifying original
    data = df.copy()
    
    # Encode categorical variables
    payment_map = {'card': 0, 'paypal': 1, 'stripe': 2}
    data['payment_method_encoded'] = data['payment_method'].map(payment_map)
    
    # Price per item
    data['amount_per_item'] = data['amount'] / data['item_count']
    
    # High risk hour flag
    data['is_high_risk_hour'] = data['is_night']
    
    # Order velocity flag
    data['order_velocity_flag'] = (data['orders_last_24h'] > 5).astype(int)
    
    # Log transformations for skewed features
    data['amount_log'] = np.log1p(data['amount'])
    data['account_age_log'] = np.log1p(data['account_age_days'])
    
    # Interaction features
    data['amount_x_velocity'] = data['amount'] * data['orders_last_24h']
    data['new_account_high_amount'] = ((data['account_age_days'] < 7) & 
                                       (data['amount'] > 500)).astype(int)
    
    return data


def save_data(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    feature_names: list
):
    """
    Save processed datasets for training
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    train_data = {
        'X': X_train,
        'y': y_train,
        'feature_names': feature_names,
    }
    
    test_data = {
        'X': X_test,
        'y': y_test,
        'feature_names': feature_names,
    }
    
    train_path = os.path.join(OUTPUT_DIR, TRAIN_FILENAME)
    test_path = os.path.join(OUTPUT_DIR, TEST_FILENAME)
    
    with open(train_path, 'wb') as f:
        pickle.dump(train_data, f)
    
    with open(test_path, 'wb') as f:
        pickle.dump(test_data, f)
    
    print(f"✓ Training data saved to {train_path}")
    print(f"✓ Testing data saved to {test_path}")


# =============================================
# Main Data Generation Pipeline
# =============================================

def main():
    """Generate synthetic fraud detection dataset"""
    print("="*60)
    print("SYNTHETIC FRAUD DATA GENERATION")
    print("="*60)
    
    # Generate user profiles
    print("\n[1/5] Generating user profiles...")
    n_users = N_SAMPLES // 3  # Users have multiple transactions
    user_profiles = generate_user_data(n_users)
    print(f"     Generated {n_users} user profiles")
    
    # Generate transactions
    print("\n[2/5] Generating transactions...")
    transactions = generate_transactions(user_profiles, N_SAMPLES)
    print(f"     Generated {N_SAMPLES} transactions")
    
    # Generate fraud labels
    print("\n[3/5] Generating fraud labels...")
    transactions['is_fraud'] = generate_fraud_labels(transactions)
    fraud_count = transactions['is_fraud'].sum()
    print(f"     Labeled {fraud_count} transactions as fraud ({fraud_count/N_SAMPLES*100:.1f}%)")
    
    # Feature engineering
    print("\n[4/5] Engineering features...")
    features_df = engineer_features(transactions)
    
    # Select feature columns
    feature_columns = [
        'amount',
        'amount_log',
        'item_count',
        'orders_last_24h',
        'total_orders',
        'account_age_days',
        'account_age_log',
        'address_match',
        'hour_of_day',
        'day_of_week',
        'is_weekend',
        'is_high_risk_hour',
        'payment_method_encoded',
        'amount_per_item',
        'order_velocity_flag',
        'amount_x_velocity',
        'new_account_high_amount',
    ]
    
    X = features_df[feature_columns].values
    y = features_df['is_fraud'].values
    
    print(f"     Feature matrix shape: {X.shape}")
    print(f"     Number of features: {len(feature_columns)}")
    
    # Save raw data
    print("\n[5/5] Saving data...")
    csv_path = os.path.join(OUTPUT_DIR, DATA_FILENAME)
    features_df[feature_columns + ['is_fraud', 'transaction_id', 'user_id', 'timestamp']].to_csv(
        csv_path, index=False
    )
    print(f"✓ Raw data saved to {csv_path}")
    
    # Display dataset statistics
    print("\n" + "="*60)
    print("DATASET STATISTICS")
    print("="*60)
    print(f"Total samples:     {N_SAMPLES}")
    print(f"Fraud samples:     {fraud_count} ({fraud_count/N_SAMPLES*100:.1f}%)")
    print(f"Legitimate samples: {N_SAMPLES - fraud_count} ({(1-fraud_count/N_SAMPLES)*100:.1f}%)")
    print(f"Features:          {len(feature_columns)}")
    print(f"Users:             {n_users}")
    print(f"\nDate range: {transactions['timestamp'].min()} to {transactions['timestamp'].max()}")
    print(f"Average transaction: ${transactions['amount'].mean():.2f}")
    print(f"Median transaction:  ${transactions['amount'].median():.2f}")
    print(f"Max transaction:     ${transactions['amount'].max():.2f}")
    
    # Feature statistics
    print("\nFEATURE IMPORTANCE (Baseline Correlation with Fraud):")
    correlations = features_df[feature_columns].corrwith(features_df['is_fraud']).sort_values(ascending=False)
    for feature, corr in correlations.items():
        print(f"  {feature:30s}: {corr:.4f}")
    
    print("\n" + "="*60)
    print("DATA GENERATION COMPLETE!")
    print("="*60)
    print(f"\nData saved to: {os.path.abspath(OUTPUT_DIR)}")
    print("Ready for model training!\n")


if __name__ == "__main__":
    main()