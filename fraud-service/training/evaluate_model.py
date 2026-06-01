"""
Model Evaluation Script for Fraud Detection
Comprehensive evaluation with visualizations and metrics
"""

import os
import pickle
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
from typing import Dict, Any, Tuple
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    confusion_matrix,
    classification_report,
    roc_curve,
    precision_recall_curve,
    ConfusionMatrixDisplay,
)
from sklearn.model_selection import learning_curve
import joblib

# =============================================
# Configuration
# =============================================

MODEL_DIR = "./models"
REPORT_DIR = "./models/reports"
MODEL_FILENAME = "fraud_model.pkl"
SCALER_FILENAME = "scaler.pkl"
TEST_DATA_FILENAME = "test_data.pkl"

# Visualization settings
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

# =============================================
# Load Model and Data
# =============================================

def load_artifacts() -> Tuple[Any, Any, pd.DataFrame, np.ndarray]:
    """
    Load trained model and test data
    """
    model_path = os.path.join(MODEL_DIR, MODEL_FILENAME)
    scaler_path = os.path.join(MODEL_DIR, SCALER_FILENAME)
    test_path = os.path.join(MODEL_DIR, TEST_DATA_FILENAME)
    
    print(f"Loading model from {model_path}")
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    print(f"Loading scaler from {scaler_path}")
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    
    print(f"Loading test data from {test_path}")
    with open(test_path, 'rb') as f:
        test_data = pickle.load(f)
    
    return model, scaler, test_data['X'], test_data['y'], test_data['feature_names']


# =============================================
# Evaluation Functions
# =============================================

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_proba: np.ndarray) -> Dict[str, float]:
    """
    Calculate comprehensive performance metrics
    """
    metrics = {
        'accuracy': accuracy_score(y_true, y_pred),
        'precision': precision_score(y_true, y_pred),
        'recall': recall_score(y_true, y_pred),
        'f1_score': f1_score(y_true, y_pred),
        'roc_auc': roc_auc_score(y_true, y_proba[:, 1]) if y_proba.shape[1] > 1 else roc_auc_score(y_true, y_proba),
        'avg_precision': average_precision_score(y_true, y_proba[:, 1]) if y_proba.shape[1] > 1 else average_precision_score(y_true, y_proba),
    }
    
    # Calculate specificity (true negative rate)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    metrics['specificity'] = tn / (tn + fp)
    metrics['false_positive_rate'] = fp / (fp + tn)
    metrics['false_negative_rate'] = fn / (fn + tp)
    
    return metrics


def plot_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, save_path: str):
    """
    Plot and save confusion matrix
    """
    fig, ax = plt.subplots(figsize=(8, 6))
    
    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=['Legitimate', 'Fraud'])
    disp.plot(ax=ax, cmap='Blues', values_format='d')
    
    ax.set_title('Confusion Matrix - Fraud Detection Model', fontsize=14, fontweight='bold')
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Confusion matrix saved to {save_path}")


def plot_roc_curve(y_true: np.ndarray, y_proba: np.ndarray, save_path: str):
    """
    Plot and save ROC curve
    """
    fig, ax = plt.subplots(figsize=(8, 6))
    
    fpr, tpr, thresholds = roc_curve(y_true, y_proba[:, 1])
    roc_auc = roc_auc_score(y_true, y_proba[:, 1])
    
    ax.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC curve (AUC = {roc_auc:.3f})')
    ax.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--', label='Random Classifier')
    
    ax.set_xlim([0.0, 1.0])
    ax.set_ylim([0.0, 1.05])
    ax.set_xlabel('False Positive Rate', fontsize=12)
    ax.set_ylabel('True Positive Rate', fontsize=12)
    ax.set_title('ROC Curve - Fraud Detection', fontsize=14, fontweight='bold')
    ax.legend(loc='lower right')
    ax.grid(alpha=0.3)
    
    # Find optimal threshold
    optimal_idx = np.argmax(tpr - fpr)
    ax.scatter(fpr[optimal_idx], tpr[optimal_idx], color='red', s=100, 
              label=f'Optimal threshold: {thresholds[optimal_idx]:.3f}')
    ax.legend(loc='lower right')
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ ROC curve saved to {save_path}")
    
    return thresholds[optimal_idx]


def plot_precision_recall_curve(y_true: np.ndarray, y_proba: np.ndarray, save_path: str):
    """
    Plot and save Precision-Recall curve
    """
    fig, ax = plt.subplots(figsize=(8, 6))
    
    precision, recall, thresholds = precision_recall_curve(y_true, y_proba[:, 1])
    avg_precision = average_precision_score(y_true, y_proba[:, 1])
    
    ax.plot(recall, precision, color='green', lw=2, 
            label=f'PR curve (AP = {avg_precision:.3f})')
    
    ax.set_xlabel('Recall', fontsize=12)
    ax.set_ylabel('Precision', fontsize=12)
    ax.set_title('Precision-Recall Curve - Fraud Detection', fontsize=14, fontweight='bold')
    ax.legend(loc='lower left')
    ax.grid(alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Precision-Recall curve saved to {save_path}")


def plot_feature_importance(model: Any, feature_names: list, save_path: str):
    """
    Plot and save feature importance
    """
    fig, ax = plt.subplots(figsize=(10, 8))
    
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    # Plot top 15 features
    n_features = min(15, len(feature_names))
    top_indices = indices[:n_features]
    
    ax.barh(range(n_features), importances[top_indices][::-1], align='center')
    ax.set_yticks(range(n_features))
    ax.set_yticklabels([feature_names[i] for i in top_indices][::-1])
    ax.set_xlabel('Feature Importance', fontsize=12)
    ax.set_title('Top Feature Importance - Fraud Detection Model', fontsize=14, fontweight='bold')
    ax.grid(axis='x', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Feature importance plot saved to {save_path}")


def plot_threshold_analysis(y_true: np.ndarray, y_proba: np.ndarray, save_path: str):
    """
    Analyze model performance at different thresholds
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    thresholds = np.arange(0.1, 1.0, 0.05)
    
    metrics_data = {
        'threshold': [],
        'precision': [],
        'recall': [],
        'f1_score': [],
        'accuracy': [],
    }
    
    for threshold in thresholds:
        y_pred = (y_proba[:, 1] >= threshold).astype(int)
        
        metrics_data['threshold'].append(threshold)
        metrics_data['precision'].append(precision_score(y_true, y_pred, zero_division=0))
        metrics_data['recall'].append(recall_score(y_true, y_pred, zero_division=0))
        metrics_data['f1_score'].append(f1_score(y_true, y_pred, zero_division=0))
        metrics_data['accuracy'].append(accuracy_score(y_true, y_pred))
    
    # Plot metrics vs threshold
    ax1 = axes[0, 0]
    ax1.plot(metrics_data['threshold'], metrics_data['precision'], label='Precision', lw=2)
    ax1.plot(metrics_data['threshold'], metrics_data['recall'], label='Recall', lw=2)
    ax1.plot(metrics_data['threshold'], metrics_data['f1_score'], label='F1 Score', lw=2)
    ax1.set_xlabel('Threshold')
    ax1.set_ylabel('Score')
    ax1.set_title('Metrics vs Threshold')
    ax1.legend()
    ax1.grid(alpha=0.3)
    
    # Find optimal threshold
    optimal_idx = np.argmax(metrics_data['f1_score'])
    ax1.axvline(thresholds[optimal_idx], color='red', linestyle='--', alpha=0.5, 
                label=f'Optimal: {thresholds[optimal_idx]:.2f}')
    ax1.legend()
    
    # Probability distribution
    ax2 = axes[0, 1]
    ax2.hist(y_proba[y_true == 0, 1], bins=30, alpha=0.5, label='Legitimate', color='green', density=True)
    ax2.hist(y_proba[y_true == 1, 1], bins=30, alpha=0.5, label='Fraud', color='red', density=True)
    ax2.set_xlabel('Predicted Fraud Probability')
    ax2.set_ylabel('Density')
    ax2.set_title('Score Distribution by Class')
    ax2.legend()
    ax2.grid(alpha=0.3)
    
    # Cost analysis (simplified)
    ax3 = axes[1, 0]
    cost_per_false_negative = 100  # Cost of missing fraud
    cost_per_false_positive = 10   # Cost of false alarm
    
    total_costs = []
    for threshold in thresholds:
        y_pred = (y_proba[:, 1] >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
        total_cost = fp * cost_per_false_positive + fn * cost_per_false_negative
        total_costs.append(total_cost)
    
    ax3.plot(thresholds, total_costs, lw=2)
    min_cost_idx = np.argmin(total_costs)
    ax3.axvline(thresholds[min_cost_idx], color='red', linestyle='--', alpha=0.5,
                label=f'Min cost: {thresholds[min_cost_idx]:.2f}')
    ax3.set_xlabel('Threshold')
    ax3.set_ylabel('Total Cost ($)')
    ax3.set_title('Cost Analysis by Threshold')
    ax3.legend()
    ax3.grid(alpha=0.3)
    
    # Predictions at different thresholds
    ax4 = axes[1, 1]
    threshold_counts = []
    for threshold in thresholds:
        count = (y_proba[:, 1] >= threshold).sum()
        threshold_counts.append(count)
    
    ax4.plot(thresholds, threshold_counts, lw=2)
    ax4.fill_between(thresholds, threshold_counts, alpha=0.3)
    ax4.set_xlabel('Threshold')
    ax4.set_ylabel('Number of Flagged Transactions')
    ax4.set_title('Flagged Transactions by Threshold')
    ax4.grid(alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"✓ Threshold analysis saved to {save_path}")
    
    return thresholds[optimal_idx]


def generate_report(
    metrics: Dict[str, float],
    model: Any,
    feature_names: list,
    optimal_threshold: float,
    save_path: str
):
    """
    Generate comprehensive evaluation report
    """
    report = f"""
{'='*60}
FRAUD DETECTION MODEL EVALUATION REPORT
{'='*60}

Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Model Type: Random Forest Classifier

{'='*60}
PERFORMANCE METRICS
{'='*60}

Accuracy:           {metrics['accuracy']:.4f}
Precision:          {metrics['precision']:.4f}
Recall:             {metrics['recall']:.4f}
F1 Score:           {metrics['f1_score']:.4f}
ROC AUC:            {metrics['roc_auc']:.4f}
Average Precision:  {metrics['avg_precision']:.4f}
Specificity:        {metrics['specificity']:.4f}

False Positive Rate: {metrics['false_positive_rate']:.4f}
False Negative Rate: {metrics['false_negative_rate']:.4f}

Optimal Threshold:   {optimal_threshold:.3f}

{'='*60}
MODEL INFORMATION
{'='*60}

Number of Trees:      {model.n_estimators}
Max Depth:            {model.max_depth}
Min Samples Split:    {model.min_samples_split}
Min Samples Leaf:     {model.min_samples_leaf}
Number of Features:   {len(feature_names)}

{'='*60}
TOP 10 FEATURE IMPORTANCE
{'='*60}
"""
    
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    for i, idx in enumerate(indices[:10]):
        report += f"{i+1:2d}. {feature_names[idx]:30s} : {importances[idx]:.4f}\n"
    
    report += f"""
{'='*60}
INTERPRETATION
{'='*60}

1. Model Performance:
   - The model achieves {metrics['roc_auc']:.3f} ROC AUC, indicating {'excellent' if metrics['roc_auc'] > 0.9 else 'good' if metrics['roc_auc'] > 0.8 else 'moderate'} discriminative ability.
   - Precision of {metrics['precision']:.3f} means {metrics['precision']*100:.1f}% of flagged transactions are truly fraudulent.
   - Recall of {metrics['recall']:.3f} means the model catches {metrics['recall']*100:.1f}% of all fraudulent transactions.

2. Business Impact:
   - False Positive Rate: {metrics['false_positive_rate']:.3f} ({metrics['false_positive_rate']*100:.1f}% of legitimate transactions incorrectly flagged)
   - False Negative Rate: {metrics['false_negative_rate']:.3f} ({metrics['false_negative_rate']*100:.1f}% of fraud missed)

3. Recommended Threshold:
   - Optimal threshold of {optimal_threshold:.3f} balances precision and recall.
   - Adjust based on business requirements (higher for fewer false positives, lower for catching more fraud).

{'='*60}
END OF REPORT
{'='*60}
"""
    
    report_path = os.path.join(save_path, 'evaluation_report.txt')
    with open(report_path, 'w') as f:
        f.write(report)
    
    print(f"✓ Evaluation report saved to {report_path}")
    print(report)


# =============================================
# Main Evaluation Pipeline
# =============================================

def main():
    """Run complete model evaluation"""
    print("="*60)
    print("MODEL EVALUATION")
    print("="*60)
    
    # Create report directory
    os.makedirs(REPORT_DIR, exist_ok=True)
    
    # Load artifacts
    print("\n[1/6] Loading model and test data...")
    model, scaler, X_test, y_test, feature_names = load_artifacts()
    
    # Scale test data
    print("\n[2/6] Preprocessing test data...")
    X_test_scaled = scaler.transform(X_test)
    print(f"     Test samples: {len(X_test)}")
    print(f"     Fraud cases: {y_test.sum()} ({y_test.mean()*100:.1f}%)")
    
    # Make predictions
    print("\n[3/6] Making predictions...")
    y_pred = model.predict(X_test_scaled)
    y_proba = model.predict_proba(X_test_scaled)
    
    # Calculate metrics
    print("\n[4/6] Calculating metrics...")
    metrics = calculate_metrics(y_test, y_pred, y_proba)
    
    # Generate visualizations
    print("\n[5/6] Generating visualizations...")
    
    # Confusion Matrix
    plot_confusion_matrix(
        y_test, y_pred,
        os.path.join(REPORT_DIR, 'confusion_matrix.png')
    )
    
    # ROC Curve
    plot_roc_curve(
        y_test, y_proba,
        os.path.join(REPORT_DIR, 'roc_curve.png')
    )
    
    # Precision-Recall Curve
    plot_precision_recall_curve(
        y_test, y_proba,
        os.path.join(REPORT_DIR, 'precision_recall_curve.png')
    )
    
    # Feature Importance
    plot_feature_importance(
        model, feature_names,
        os.path.join(REPORT_DIR, 'feature_importance.png')
    )
    
    # Threshold Analysis
    optimal_threshold = plot_threshold_analysis(
        y_test, y_proba,
        os.path.join(REPORT_DIR, 'threshold_analysis.png')
    )
    
    # Generate report
    print("\n[6/6] Generating evaluation report...")
    generate_report(metrics, model, feature_names, optimal_threshold, REPORT_DIR)
    
    # Save metrics for model registry
    metrics_path = os.path.join(MODEL_DIR, 'evaluation_metrics.pkl')
    metrics_data = {
        **metrics,
        'optimal_threshold': optimal_threshold,
        'evaluation_date': datetime.now().isoformat(),
        'n_test_samples': len(X_test),
        'feature_names': feature_names,
    }
    with open(metrics_path, 'wb') as f:
        pickle.dump(metrics_data, f)
    print(f"✓ Metrics saved to {metrics_path}")
    
    print("\n" + "="*60)
    print("EVALUATION COMPLETE!")
    print("="*60)
    print(f"\nReports saved to: {os.path.abspath(REPORT_DIR)}")
    print("Ready for deployment!\n")


if __name__ == "__main__":
    main()