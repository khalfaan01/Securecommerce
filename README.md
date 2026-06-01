# SecureCommerce

> Security-first e-commerce platform with AI-powered fraud detection, full audit traceability, and real-time threat visibility dashboard.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (React + Vite)                                         │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐      │
│ │ Customer Shop│ │ Admin Panel  │ │ Security Dashboard   │      │
│ └──────────────┘ └──────────────┘ └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
│ REST API
▼
┌─────────────────────────────────────────────────────────────────┐
│ NODE.JS / EXPRESS BACKEND                                       │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐      │
│ │Auth (JWT/MFA)│ │ E-Commerce   │ │ Security Middleware  │      │
│ └──────────────┘ └──────────────┘ └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
│ Redis Pub/Sub
▼
┌─────────────────────────────────────────────────────────────────┐
│ PYTHON FRAUD DETECTION MICROSERVICE                             │
│ ┌────────────────────┐ ┌──────────────────────────────────┐     │
│ │ FastAPI Server     │ │ Random Forest ML Model           │     │
│ └────────────────────┘ └──────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```
---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- MongoDB 7+
- Redis 7+

### Development Setup

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/secure-commerce.git
cd secure-commerce

2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

3. Start with Docker Compose
docker-compose up -d

Backend:
cd backend
npm install
npm run dev

Frontend:
cd frontend
npm install
npm run dev

Fraud Service:
cd fraud-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

```
---

## Features

### Security

* JWT authentication with access/refresh token rotation
* MFA via TOTP (Google Authenticator)
* RBAC with three roles: Customer, Admin, Auditor
* Rate limiting & brute force protection
* Input sanitization (NoSQL injection, XSS prevention)
* Secure headers (Helmet, CSP, HSTS)

### E-Commerce

* Product catalog with categories, search, and filtering
* Shopping cart with session/anonymous support
* Order management with status tracking
* Payment simulation

### AI Fraud Detection

* Random Forest ML model
* Real-time transaction scoring via Redis pub/sub
* Heuristic fallback when ML service unavailable
* Fraud review queue with approve/reject workflow

### Dashboards

* Security Dashboard: Live audit feed, threat alerts, IP threat map
* Admin Panel: Product/Order/User management
* Analytics: Revenue trends, top products, fraud statistics
* API Endpoints

---

### Authentication

POST /api/v1/auth/register - Register new user  
POST /api/v1/auth/login - Login  
POST /api/v1/auth/refresh-token - Refresh access token  
POST /api/v1/auth/mfa/setup - Setup MFA  
POST /api/v1/auth/mfa/verify - Verify MFA  

---

### Products

GET /api/v1/products - List products  
POST /api/v1/products - Create product (Admin)  
PUT /api/v1/products/:id - Update product (Admin)  
DELETE /api/v1/products/:id - Delete product (Admin)  

---

### Orders

POST /api/v1/orders - Create order  
GET /api/v1/orders/my-orders - Get user orders  
GET /api/v1/orders/:id - Get order detail  

---

### Security (Auditor/Admin)

GET /api/v1/audit/logs - Audit logs  
GET /api/v1/fraud/alerts - Fraud alerts  
GET /api/v1/analytics/summary - Analytics summary  

---

## Security Features

```text
Feature | Implementation
--------|--------------
Authentication | JWT + Refresh Token Rotation  
MFA | TOTP (speakeasy)  
RBAC | Customer, Admin, Auditor roles  
RateLimiting | express-rate-limit  
Headers | Helmet (CSP, HSTS, X-Frame)  
InputValidation | Zod schemas  
NoSQLInjection | express-mongo-sanitize  
AuditLogging | Immutable audit collection  
FraudDetection | Random Forest ML + Heuristics  
```