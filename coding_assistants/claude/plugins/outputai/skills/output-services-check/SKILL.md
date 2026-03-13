---
name: output-services-check
description: Verify Output SDK development services are running. Use when debugging workflows, starting development, encountering connection errors, services may be down, or when you see "ECONNREFUSED" or timeout errors.
allowed-tools: [Bash, Read]
---

# Output Services Health Check

## Overview

This skill verifies that all required Output SDK development services are running and healthy. The Output SDK requires three services for local development: Docker containers, the API server, and the Temporal server with its UI.

## When to Use This Skill

- Starting a debugging session
- Encountering connection refused errors (ECONNREFUSED)
- Workflows failing to start or connect
- Timeout errors when running workflows
- Before running any workflow commands
- When the development environment seems unresponsive

## Instructions

### Step 1: Check Docker Containers

```bash
docker ps | grep output
```

**Expected**: You should see containers related to `output` running. If no containers appear, Docker may not be running or the services haven't been started.

### Step 2: Check API Server Health

```bash
curl -s http://localhost:3001/health
```

**Expected**: Returns a health status response. If this fails with "Connection refused", the API server is not running.

### Step 3: Check Temporal UI Accessibility

```bash
curl -s http://localhost:8080 > /dev/null && echo "Temporal UI accessible" || echo "Temporal UI not accessible"
```

**Expected**: "Temporal UI accessible". If not accessible, Temporal server may not be running.

## Remediation Steps

### If Docker is not running:
1. Start Docker Desktop (macOS/Windows) or the Docker daemon (Linux)
2. Wait for Docker to fully initialize
3. Re-run the checks

### If services are not running:
```bash
# Start all development services
npx output dev
```

Wait 30-60 seconds for all services to initialize, then re-run the checks.

### If only some services are down:
```bash
# Restart all services using Docker Compose
docker compose down
docker compose up -d
```

### If services fail to start:
1. Check for port conflicts: `lsof -i :3001` and `lsof -i :8080`
2. Check Docker logs: `docker compose logs`
3. Ensure you have sufficient system resources (memory, disk space)

## Decision Tree

```
IF docker_not_running:
  ACTION: Start Docker Desktop/daemon
  WAIT: for Docker to initialize

IF no_output_containers:
  RUN: npx output dev
  WAIT: 30-60 seconds for services

IF api_not_responding:
  CHECK: port 3001 for conflicts
  RUN: output dev (if not already running)

IF temporal_not_accessible:
  CHECK: port 8080 for conflicts
  CHECK: docker compose logs for Temporal errors

IF all_services_healthy:
  PROCEED: with workflow debugging
```

## Examples

**Scenario**: User reports "connection refused" when running a workflow

```bash
# First, check if services are running
docker ps | grep output
# Output: (empty - no containers)

# Start services
npx output dev

# Wait and verify
sleep 60
curl -s http://localhost:3001/health
# Output: {"status":"healthy"}
```

**Scenario**: Partial service failure

```bash
# API responds but Temporal doesn't
curl -s http://localhost:3001/health  # Works
curl -s http://localhost:8080  # Fails

# Check Temporal logs
docker compose logs temporal

# Restart just Temporal
docker compose restart temporal
```
