import App from './app';

async function startServer() {
  try {
    console.log('🚀 Starting SLA Monitor API Server...');
    
    // Create application instance
    const app = new App();
    
    // Initialize the application (database, migrations, seeding)
    await app.initialize();
    
    // Start listening for requests
    app.listen();
    
  } catch (error: any) {
    console.error('❌ Failed to start server:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Start the server
startServer();