import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { MobileKitPage } from './app/MobileKitPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/kit" element={<MobileKitPage />} />
      </Routes>
    </BrowserRouter>
  );
}
