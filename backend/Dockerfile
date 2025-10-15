# Use an official Node.js runtime as the base image
FROM node:18-slim

# The 'node' user is already created in the base image, so we'll use that.
# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage build cache
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Copy the rest of the application source code
COPY . .

# Change ownership of the app directory to the non-root user
RUN chown -R node:node /usr/src/app

# Switch to the non-root user for security
USER node

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD [ "node", "index.js" ]