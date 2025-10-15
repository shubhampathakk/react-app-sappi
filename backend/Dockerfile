# Use an official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Copy the rest of the application source code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD [ "node", "index.js" ]

