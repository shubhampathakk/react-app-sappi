# STAGE 1: Build the React application
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# STAGE 2: Serve the application using a lightweight web server (Nginx)
FROM nginx:stable-alpine

# Install envsubst which is part of gettext
RUN apk add --no-cache gettext

# Copy the build output from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy the Nginx configuration template
COPY nginx.conf.template /etc/nginx/conf.d/nginx.conf.template

# Copy the entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose port 8080 - Cloud Run default
EXPOSE 8080

# Run the entrypoint script when the container starts
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

