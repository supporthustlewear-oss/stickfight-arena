import React from 'react';
import Landing from './components/Landing.jsx';
import Game from './components/Game.jsx';

export default function App() {
  return window.location.pathname.startsWith('/game') ? <Game /> : <Landing />;
}
