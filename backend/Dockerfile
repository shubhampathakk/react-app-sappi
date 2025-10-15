# Use an official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Create a non-root user to run the application
RUN groupadd --system --gid 1001 node && \
    useradd --system --uid 1001 --gid 1001 node

# Copy package.json and package-lock.json to leverage build cache
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Change ownership of node_modules to the non-root user
RUN chown -R node:node /usr/src/app/node_modules

# Copy the rest of the application source code
COPY . .
RUN chown -R node:node /usr/src/app

# Switch to the non-root user
USER node

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD [ "node", "index.js" ]