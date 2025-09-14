# ---- Base Stage ----
# Use a specific Node.js version for reproducibility
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies required for Prisma
RUN apk add --no-cache openssl

# ---- Builder Stage ----
# This stage builds the application
FROM base AS builder

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Generate Prisma Client
# This needs the schema to be present
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# ---- Runner Stage ----
# This is the final, lean production image
FROM base AS runner

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy built assets and necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# The database file itself should be mounted as a volume,
# but the directory needs to exist.
RUN mkdir -p /app/db

# Expose the port the app runs on
EXPOSE 3000

# The command to start the application in production
CMD ["npm", "start"]