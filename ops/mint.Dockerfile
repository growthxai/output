# Use Node.js slim image for smaller size
FROM node:24.13.0-slim

# Set working directory
WORKDIR /app

# Install mint
RUN npm install -g mint

ENV NODE_ENV=development
