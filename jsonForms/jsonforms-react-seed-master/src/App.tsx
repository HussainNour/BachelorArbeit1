import './App.css';
import { Header } from './components/Header';
import { JsonFormsDemo } from './components/JsonFormsDemo';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ZuarbeitEditor } from './components/ZuarbeitEditor';
import ManagerLogin from './components/ManagerLogin';

const App = () => {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* Manager-Ansicht: komplette Liste (braucht Token) */}
        <Route path="/" element={<JsonFormsDemo />} />

        {/* Manager-Login */}
        <Route path="/login" element={<ManagerLogin />} />

        {/* Share-Link: nur EIN Element per ID, ohne Token */}
        <Route path="/zuarbeit/:id" element={<ZuarbeitEditor />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
