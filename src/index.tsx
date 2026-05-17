#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import App from './ui/App.js';

async function main() {
  render(React.createElement(App));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
