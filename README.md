# Campus Notification Platform - Full Stack Evaluation

## 🚀 Submission Deliverables & Demo Links
* **Localhost App Address:** http://localhost:5173/
* **Application Walkthrough Video:** 


https://github.com/user-attachments/assets/639355ca-765d-4b79-af73-b8cc44bc787b







---

## 🛠️ Project Workspace Overview
This repository contains the complete implementation across all stages required for the Campus Notification System evaluation. The core workspace layout is structured as follows:
* `notification-app-be/` - Backend API implementation and route architectures
* `notification-app-fe/` - Frontend React application with mobile-responsive notification view
* `logging-middleware/` - Custom logging package tracking application state and network calls
* `notification-system-design.md` - Complete systems architecture, slow-query database analysis, and algorithms documentation

---

## 📋 Completed Evaluation Stages Summary

### 🔹 Stage 1: REST API Architecture & Design
* Modeled the complete data transfer contracts for real-time campus notifications.
* Documented consistent endpoints (`GET`, `PATCH`) with strict header-based auth and predictable JSON payloads.
* Outlined persistent WebSocket/SSE real-time push mechanics.

### 🔹 Stage 2: Database Schema & High-Volume Strategy
* Selected PostgreSQL for robust relational management and indexing.
* Designed table layouts using UUID tracking and strict field constraint mappings.
* Documented production strategies for scaling up to 5,000,000+ records using range partitioning and connection pooling.

### 🔹 Stage 3: Query Optimization & Indexing Strategy
* Analyzed query bottlenecks causing sequential disk reads during user log-ins.
* Implemented a **Composite Index** solution balancing `(studentID, isRead, createdAt ASC)` to bypass in-memory sorting metrics.
* Formulated range-based queries tracking target notification segments over trailing 7-day windows.

### 🔹 Stage 4 & 5: High-Traffic Optimization & Async Infrastructure
* Solved database connection starvation by mapping in-memory caching layers (Redis).
* Redesigned synchronous loop blockages into an **Event-Driven Architecture** utilizing background workers and message brokers to eliminate single points of failure.

### 🔹 Stage 6: Priority Inbox Ranking Engine
* Created a production-ready sorting algorithm ranking unread feeds via a mathematical combination of type weights and ingestion recency.

### 🔹 Stage 7: Responsive Interface & Screenshots
* Polished responsive layouts for desktop and mobile devices.
* Captured and embedded visual platform execution previews directly inside the system design documentation file.

---

## 🏗️ Local Installation & Running Instructions

### 1. Prerequisites
* Node.js (v18 or higher recommended)
* Git

### 2. Running the Frontend Server
```bash
cd notification-app-fe
npm install
npm start






https://github.com/user-attachments/assets/5e441d8c-e404-46cc-88b5-bd636836dbbb



