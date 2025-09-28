import './App.css';
import { Header } from './components/Header';
import { JsonFormsDemo } from './components/JsonFormsDemo';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ZuarbeitEditor } from './components/ZuarbeitEditor'; // ⬅️ neu

const App = () => {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* Manager-Ansicht: komplette Liste */}
        <Route path="/" element={<JsonFormsDemo />} />

        {/* Share-Link: nur EIN Element per ID */}
        <Route path="/zuarbeit/:id" element={<ZuarbeitEditor />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
