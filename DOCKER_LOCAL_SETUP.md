# Local Development with Docker - Setup Guide

This guide shows how to run the Team Flags EDU application locally using Docker and Docker Compose.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (usually comes with Docker Desktop)
- Git

## Quick Start (Recommended)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd team-flags-edu
```

### Step 2: Start Services with Docker Compose

```bash
# Build and start MongoDB and Next.js app
docker-compose up -d

# Monitor the startup
docker-compose logs -f app
```

### Step 3: Access the Application

Open your browser and go to: **http://localhost:3000**

### Step 4: Verify Everything is Running

```bash
# Check service status
docker-compose ps

# All services should show "Up" status
```

## Stopping the Services

```bash
# Stop containers (keep data)
docker-compose stop

# Stop and remove containers (keep data)
docker-compose down

# Stop and remove everything including volumes (clears database)
docker-compose down -v
```

---

## Configuration

### Environment Variables

The application uses environment variables defined in `.env.docker`. These are automatically loaded by Docker Compose.

**Default configuration:**
- MongoDB URI: `mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin`
- MongoDB User: `admin`
- MongoDB Password: `password`
- Database Name: `team-flags-edu`
- Port: `3000`

### Custom Configuration

To use different environment variables:

1. Create a `.env.local` file in the project root:
```bash
cp .env.docker .env.local
```

2. Edit `.env.local` with your values:
```dotenv
MONGODB_URI=mongodb://custom-user:custom-pass@mongodb:27017/team-flags-edu
MONGODB_DB=my-database
```

3. Update `docker-compose.yml` to use `.env.local`:
```yaml
services:
  app:
    env_file:
      - .env.local
```

4. Restart services:
```bash
docker-compose down -v && docker-compose up -d
```

---

## Development Workflow

### Using Dockerfile.dev for Hot Reload

For faster development with hot reload of code changes:

```bash
# Build development image
docker build -f Dockerfile.dev -t team-flags:dev .

# Run with volume mount for code changes
docker run -it --rm \
  -p 3000:3000 \
  -e MONGODB_URI="mongodb://admin:password@localhost:27017/team-flags-edu?authSource=admin" \
  -e MONGODB_DB="team-flags-edu" \
  -v $(pwd):/app \
  -v /app/node_modules \
  team-flags:dev
```

Or use Docker Compose with dev configuration:

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  mongodb:
    image: mongo:7-alpine
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db

  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin
      MONGODB_DB: team-flags-edu
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - mongodb

volumes:
  mongodb_data:
```

Use it with:
```bash
docker-compose -f docker-compose.dev.yml up
```

---

## Troubleshooting

### Port 3000 Already in Use

**Problem:** Error like `Port 3000 is already allocated`

**Solution:**
```bash
# Option 1: Stop the process using port 3000
docker-compose down

# Option 2: Use a different port
docker-compose -p myapp up

# Option 3: Map to different host port
# Edit docker-compose.yml:
# ports:
#   - "8000:3000"  # Access at localhost:8000
```

### MongoDB Connection Failed

**Problem:** Application crashes with MongoDB connection error

**Solution:**
```bash
# Check MongoDB logs
docker-compose logs mongodb

# Ensure MongoDB is healthy
docker-compose ps

# Verify connection string in environment variables
docker exec team-flags-app env | grep MONGODB

# If issues persist, reset MongoDB
docker-compose down -v
docker-compose up -d mongodb
```

### Application Won't Start

**Problem:** `docker-compose logs app` shows errors

**Solutions:**
1. Check if MongoDB is running and healthy:
   ```bash
   docker-compose logs mongodb
   docker exec team-flags-mongodb mongosh --authenticationDatabase admin -u admin -p password -c "db.adminCommand('ping')"
   ```

2. Verify environment variables:
   ```bash
   docker exec team-flags-app env | grep -E "MONGODB|NEXT"
   ```

3. Check application logs:
   ```bash
   docker-compose logs app --tail=100
   ```

4. Rebuild the image:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Firebase Features Not Working

**Problem:** Authentication endpoints return errors

**Solution:** Firebase Admin SDK is optional for Week 2. If you need Firebase:

1. Add Firebase credentials to `.env.docker`:
   ```dotenv
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_CLIENT_EMAIL=your_client_email
   FIREBASE_ADMIN_PRIVATE_KEY=your_private_key
   ```

2. Restart services:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

### Database Persistence

By default, MongoDB data is stored in a Docker volume (`mongodb_data`). This means:

- Data persists when you stop/start containers
- Data is deleted when you run `docker-compose down -v`

To backup data:
```bash
# Export MongoDB data
docker exec team-flags-mongodb mongosh --authenticationDatabase admin -u admin -p password --eval "db.getSiblingDB('team-flags-edu').getCollectionNames()" > collections.txt

# Full backup (requires mongodump installed)
docker run --rm \
  -v $(pwd)/backup:/backup \
  --network team-flags-network \
  mongo:7-alpine \
  mongodump --authenticationDatabase admin -u admin -p password --host mongodb --out /backup
```

---

## Advanced Usage

### Building the Production Image

```bash
# Build production image
docker build -t team-flags:latest .

# Run production image
docker run -d --name team-flags \
  -p 3000:3000 \
  -e MONGODB_URI="mongodb://admin:password@host.docker.internal:27017/team-flags-edu?authSource=admin" \
  -e MONGODB_DB="team-flags-edu" \
  team-flags:latest
```

### Using External MongoDB

To connect to a MongoDB instance outside Docker:

```yaml
# docker-compose.yml
services:
  app:
    environment:
      MONGODB_URI: mongodb://user:pass@external-mongo.example.com:27017/team-flags-edu
```

### Multiple Environments

Create separate compose files:

```bash
# Development
docker-compose -f docker-compose.dev.yml up

# Production
docker-compose -f docker-compose.yml up

# Testing
docker-compose -f docker-compose.test.yml up
```

### Health Checks

The application includes health checks. Monitor them:

```bash
# Check health status
docker-compose ps

# View detailed health info
docker inspect team-flags-app | grep -A 5 "Health"
```

---

## Common Commands

```bash
# View logs
docker-compose logs app              # Recent logs
docker-compose logs -f app           # Follow logs
docker-compose logs --tail=50 app    # Last 50 lines

# Execute commands in container
docker exec team-flags-app npm run build
docker exec team-flags-app npm test

# Access MongoDB shell
docker exec -it team-flags-mongodb mongosh \
  --authenticationDatabase admin \
  -u admin \
  -p password

# Restart services
docker-compose restart app
docker-compose restart mongodb

# View resource usage
docker stats

# Clean up unused resources
docker system prune
docker volume prune
```

---

## Performance Tips

1. **Allocate more resources to Docker:**
   - Preferences → Resources → Memory/CPU
   - Recommended: 4GB RAM, 2+ CPU cores

2. **Use .dockerignore:**
   - Already configured to exclude node_modules, .git, etc.
   - Speeds up build time

3. **Build caching:**
   - Docker caches layers
   - Changes to `package.json` trigger full rebuild
   - Other changes only rebuild affected layers

4. **Multi-stage builds:**
   - Production Dockerfile uses 3 stages
   - Reduces final image size from ~600MB to ~150MB

---

## CI/CD Integration

To use Docker in your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Build Docker image
  run: docker build -t team-flags:${{ github.sha }} .

- name: Push to registry
  run: docker push team-flags:${{ github.sha }}

- name: Deploy
  run: docker-compose -f docker-compose.yml up -d
```

---

## Support

If you encounter issues:

1. Check [DOCKER_LOCAL_SETUP_FIXES.md](DOCKER_LOCAL_SETUP_FIXES.md) for detailed issue explanations
2. Run `docker-compose logs` to check all service logs
3. Ensure Docker and Docker Compose are up to date
4. Try rebuilding: `docker-compose build --no-cache`

---

## Next Steps

Once Docker is working:

- ✅ Explore the application at http://localhost:3000
- ✅ Check out the API documentation in `lib/api-client.ts`
- ✅ Read [README.md](README.md) for project structure
- ✅ Review [DOCKER_TESTING.md](DOCKER_TESTING.md) for educational concepts
