import { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";
import api from "../api/axios";

const WhatsAppStatus = () => {
  const [status, setStatus] = useState({
    isConnected: false,
    qrCode: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const response = await api.get("/api/whatsapp-status", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      });

      if (response.data.success) {
        setStatus({
          isConnected: response.data.isConnected,
          qrCode: response.data.qrCode,
        });
      }
    } catch (error) {
      console.error("Status check error:", error);
      toast.error("Failed to check WhatsApp status");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []); // Removed dependency on status.isConnected

  if (isLoading) {
    return <div>Checking WhatsApp status...</div>;
  }

  return (
    <div className="mb-6 p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">WhatsApp Connection Status</h2>

      {status.isConnected ? (
        <div className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          WhatsApp Connected
        </div>
      ) : (
        <div>
          <div className="text-yellow-600 mb-4">
            WhatsApp not connected. Please scan the QR code with your phone:
          </div>
          {status.qrCode ? (
            <div className="flex justify-center">
              <QRCodeSVG value={status.qrCode} size={256} />
            </div>
          ) : (
            <div>Waiting for QR code...</div>
          )}
          <div className="mt-4 text-sm text-gray-600">
            <ol className="list-decimal list-inside space-y-1">
              <li>Open WhatsApp on your phone</li>
              <li>Tap Menu or Settings and select WhatsApp Web</li>
              <li>Point your phone to this screen to capture the QR code</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppStatus;
