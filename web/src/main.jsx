import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../public-css/style.css';
import '../public-css/game.css';
import '../public-css/landing.css';

createRoot(document.getElementById('root')).render(<App />);
