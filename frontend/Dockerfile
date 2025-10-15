# STAGE 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies first to leverage build cache
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the application
RUN npm run build


# STAGE 2: Serve the application using a lightweight web server (Nginx)
FROM nginx:stable-alpine

# Install envsubst which is part of gettext
RUN apk add --no-cache gettext

# Copy the build output from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy the Nginx configuration template and entrypoint script
COPY nginx.conf.template /etc/nginx/conf.d/nginx.conf.template
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose the port Cloud Run will use
EXPOSE 8080

# Run the entrypoint script when the container starts
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]