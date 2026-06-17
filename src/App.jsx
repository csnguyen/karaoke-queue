import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueueProvider } from './context/QueueContext'
import TVView from './pages/TVView'
import MobileView from './pages/MobileView'

export default function App() {
  return (
    <BrowserRouter>
      <QueueProvider>
        <Routes>
          <Route path="/tv" element={<TVView />} />
          <Route path="/" element={<MobileView />} />
        </Routes>
      </QueueProvider>
    </BrowserRouter>
  )
}
