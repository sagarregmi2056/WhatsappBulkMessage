import { useState } from "react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import axios from "axios";
import WhatsAppStatus from "./WhatsAppStatus";

const BulkMessageSender = () => {
  // State management
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState("");

  // Reset form function
  const resetForm = () => {
    setCampaignName("");
    setMessageTemplate("");
    setMediaFile(null);
    setMediaType("");
    setContacts([]);
    setSelectedContacts([]);
    setFileName("");

    // Reset file input
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach((input) => {
      input.value = "";
    });
  };

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("Parsed CSV:", results.data);

        const validContacts = results.data
          .filter(
            (row) =>
              row.Name &&
              row.Phone &&
              row.Name.trim() !== "" &&
              row.Phone.trim() !== ""
          )
          .map((row) => ({
            name: row.Name.trim(),
            phoneNumber: row.Phone.trim(),
          }));

        if (validContacts.length === 0) {
          toast.error("No valid contacts found in CSV");
          return;
        }

        setContacts(validContacts);
        setSelectedContacts(validContacts.map((c) => c.phoneNumber));
        toast.success(`Loaded ${validContacts.length} contacts`);
      },
      error: (error) => {
        toast.error(`Error parsing CSV: ${error.message}`);
        console.error("CSV parsing error:", error);
      },
    });
  };

  const handleMediaUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileType = file.type.split("/")[0];
    if (fileType !== "image" && fileType !== "video") {
      toast.error("Please upload only image or video files");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size should be less than 10MB");
      event.target.value = "";
      return;
    }

    setMediaFile(file);
    setMediaType(fileType);
    toast.success(`${fileType} uploaded successfully`);
  };

  const handleSendMessages = async () => {
    if (!campaignName || !messageTemplate || selectedContacts.length === 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const selectedContactsData = contacts.filter((c) =>
        selectedContacts.includes(c.phoneNumber)
      );

      const formData = new FormData();
      formData.append("campaignName", campaignName);
      formData.append("messageTemplate", messageTemplate);
      formData.append("contacts", JSON.stringify(selectedContactsData));

      if (mediaFile) {
        formData.append("media", mediaFile);
        formData.append("mediaType", mediaType);
      }

      const response = await axios.post(
        "https://whatsappbulkmessage.onrender.com/api/send-messages",
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.data.success) {
        toast.success(
          `Successfully sent messages to ${response.data.successfulMessages} contacts`
        );
        if (response.data.failedMessages > 0) {
          toast.warning(
            `Failed to send to ${response.data.failedMessages} contacts`
          );
        }
        // Reset form after successful send
        resetForm();
      } else {
        toast.error(response.data.message || "Error sending messages");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.message || "Error sending messages");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <WhatsAppStatus />

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">WhatsApp Bulk Message Sender</h2>

        {/* CSV Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Contact List (CSV)
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <div className="mt-2 text-sm text-gray-600">
            <p>CSV format example:</p>
            <pre className="bg-gray-50 p-2 mt-1 rounded">
              Name,Phone{"\n"}
              John Doe,+1234567890{"\n"}
              Jane Smith,+9876543210
            </pre>
          </div>
          {fileName && (
            <p className="mt-2 text-sm text-gray-600">
              Loaded file: {fileName} ({contacts.length} contacts)
            </p>
          )}
        </div>

        {/* Media Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Media (Optional)
          </label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-2 text-sm text-gray-600">
            Supported formats: Images (jpg, png, gif) and Videos (mp4). Max
            size: 10MB
          </p>
          {mediaFile && (
            <p className="mt-2 text-sm text-gray-600">
              Selected {mediaType}: {mediaFile.name}
            </p>
          )}
        </div>

        {/* Campaign Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Campaign Name
          </label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter campaign name"
          />
        </div>

        {/* Message Template */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message Template
          </label>
          <textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 h-32"
            placeholder="Enter message template (use {name} for personalization)"
          />
          <p className="mt-2 text-sm text-gray-600">
            Use {"{name}"} to include the contact's name in your message
          </p>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSendMessages}
          disabled={
            isLoading ||
            selectedContacts.length === 0 ||
            !campaignName ||
            !messageTemplate
          }
          className={`w-full py-2 px-4 rounded font-medium ${
            isLoading ||
            selectedContacts.length === 0 ||
            !campaignName ||
            !messageTemplate
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-green-500 hover:bg-green-600 text-white"
          }`}
        >
          {isLoading
            ? "Sending Messages..."
            : selectedContacts.length === 0
            ? "Upload contacts to send messages"
            : `Send Messages (${selectedContacts.length} contacts)`}
        </button>
      </div>
    </div>
  );
};

export default BulkMessageSender;
