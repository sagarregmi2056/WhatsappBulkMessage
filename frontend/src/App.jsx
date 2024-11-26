import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Login from './components/Login';
import BulkMessageSender from './components/BulkMessageSender';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('authToken');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-right" />

      {isAuthenticated ? (
        <div>
          <nav className="bg-white shadow-md p-4">
            <div className="container mx-auto flex justify-between items-center">
              <h1 className="text-xl font-bold">WhatsApp Bulk Sender</h1>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          </nav>

          <main className="container mx-auto py-8">
            <BulkMessageSender />
          </main>
        </div>
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;