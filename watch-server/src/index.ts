#!/usr/bin/env node

import WatchServer from './server';

console.log('=€ Starting SLA Monitor Watch Server...');

const server = new WatchServer();
server.start();