import { useState, useEffect } from "react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import axios from "axios";
import WhatsAppStatus from "./WhatsAppStatus";

const validateCSVFormat = (data) => {
  if (data.length === 0) return false;

  const firstRow = data[0];
  const columns = Object.keys(firstRow).map((key) => key.toLowerCase());

  // Check for name and phone number columns with flexible naming
  const hasNameColumn = columns.includes("name");
  const hasPhoneColumn = columns.some(
    (col) =>
      col.includes("phone") || col.includes("number") || col.includes("mobile")
  );

  if (hasNameColumn && hasPhoneColumn) {
    // Map to standard format
    return data.map((row) => {
      const nameKey = Object.keys(row).find(
        (key) => key.toLowerCase() === "name"
      );
      const phoneKey = Object.keys(row).find(
        (key) =>
          key.toLowerCase().includes("phone") ||
          key.toLowerCase().includes("number") ||
          key.toLowerCase().includes("mobile")
      );

      return {
        name: row[nameKey]?.trim(),
        phoneNumber: row[phoneKey]?.trim(),
      };
    });
  }

  return false;
};

const BulkMessageSender = () => {
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const validateCSVFormat = (data) => {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }

    const firstRow = data[0];
    const columns = Object.keys(firstRow).map((key) => key.toLowerCase());

    // Check for name and phone number columns with flexible naming
    const hasNameColumn = columns.some((col) => col === "name");
    const hasPhoneColumn = columns.some(
      (col) =>
        col.includes("phone") ||
        col.includes("number") ||
        col.includes("mobile")
    );

    if (hasNameColumn && hasPhoneColumn) {
      // Map to standard format
      return data
        .map((row) => {
          const nameKey = Object.keys(row).find(
            (key) => key.toLowerCase() === "name"
          );
          const phoneKey = Object.keys(row).find(
            (key) =>
              key.toLowerCase().includes("phone") ||
              key.toLowerCase().includes("number") ||
              key.toLowerCase().includes("mobile")
          );

          // Ensure both name and phone number exist and are not empty
          const name = row[nameKey]?.trim();
          const phoneNumber = row[phoneKey]?.trim();

          if (!name || !phoneNumber) {
            return null;
          }

          return { name, phoneNumber };
        })
        .filter((contact) => contact !== null); // Remove invalid contacts
    }

    return false;
  };

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validData = validateCSVFormat(results.data);
        if (!validData) {
          toast.error(
            "Invalid CSV format. Please ensure your CSV has name and phone number columns"
          );
          return;
        }

        const validContacts = validData.filter(
          (contact) =>
            contact.name &&
            contact.phoneNumber &&
            contact.name.trim() !== "" &&
            contact.phoneNumber.trim() !== ""
        );

        if (validContacts.length === 0) {
          toast.error("No valid contacts found in CSV");
          return;
        }

        setContacts(validContacts);
        setSelectedContacts(
          validContacts.map((contact) => contact.phoneNumber)
        );
        toast.success(`Loaded ${validContacts.length} contacts`);
      },
      error: (error) => {
        toast.error(`Error parsing CSV file: ${error.message}`);
        console.error("CSV parsing error:", error);
      },
    });
  };

  const handleMediaUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const fileType = file.type.split("/")[0];
    if (fileType !== "image" && fileType !== "video") {
      toast.error("Please upload only image or video files");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size should be less than 10MB");
      return;
    }

    setMediaFile(file);
    setMediaType(fileType);
    toast.success(`${fileType} uploaded successfully`);
  };

  const handleSelectAllContacts = (e) => {
    if (e.target.checked) {
      setSelectedContacts(contacts.map((c) => c.phoneNumber));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSendMessages = async () => {
    if (!campaignName || !messageTemplate || selectedContacts.length === 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsLoading(true);
    try {
      // Get selected contacts data
      const selectedContactsData = contacts.filter((contact) =>
        selectedContacts.includes(contact.phoneNumber)
      );

      console.log("Selected contacts:", selectedContactsData); // Debug log

      const formData = new FormData();
      formData.append("campaignName", campaignName);
      formData.append("messageTemplate", messageTemplate);
      formData.append("contacts", JSON.stringify(selectedContactsData));

      if (mediaFile) {
        formData.append("media", mediaFile);
        formData.append("mediaType", mediaType);
      }

      // Log the formData contents for debugging
      for (let pair of formData.entries()) {
        console.log(pair[0], pair[1]);
      }

      const response = await axios.post(
        "http://localhost:3000/api/send-messages",
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.data.success) {
        const { successfulMessages, failedMessages } = response.data;

        if (successfulMessages > 0) {
          toast.success(
            `Successfully sent messages to ${successfulMessages} contacts`
          );
        }

        if (failedMessages > 0) {
          toast.warning(
            `Failed to send messages to ${failedMessages} contacts`
          );
        }

        // Clear form after successful send
        setCampaignName("");
        setMessageTemplate("");
        setMediaFile(null);
        setMediaType("");
        setContacts([]);
        setSelectedContacts([]);
        setFileName("");
      } else {
        toast.error(response.data.message || "Error sending messages");
      }
    } catch (error) {
      console.error("Error sending messages:", error);
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

        {/* CSV Upload Section */}
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
              name,phoneNumber{"\n"}
              John Doe,1234567890{"\n"}
              Jane Smith,9876543210
            </pre>
          </div>
          {fileName && (
            <p className="mt-2 text-sm text-gray-600">
              Loaded file: {fileName}
            </p>
          )}
        </div>

        {/* Media Upload Section */}
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

        {/* Contacts Selection */}
        {contacts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Contacts ({selectedContacts.length} selected)
              </label>
              <label className="flex items-center text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedContacts.length === contacts.length}
                  onChange={handleSelectAllContacts}
                  className="mr-2"
                />
                Select All
              </label>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded">
              {contacts.map((contact) => (
                <div
                  key={contact.phoneNumber}
                  className="flex items-center p-2 hover:bg-gray-50 border-b"
                >
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(contact.phoneNumber)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedContacts([
                          ...selectedContacts,
                          contact.phoneNumber,
                        ]);
                      } else {
                        setSelectedContacts(
                          selectedContacts.filter(
                            (num) => num !== contact.phoneNumber
                          )
                        );
                      }
                    }}
                    className="mr-2"
                  />
                  <span>
                    {contact.name} - {contact.phoneNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSendMessages}
          disabled={
            isLoading ||
            selectedContacts.length === 0 ||
            !campaignName ||
            !messageTemplate
          }
          className={`w-full bg-green-500 text-white px-4 py-2 rounded ${
            isLoading ||
            selectedContacts.length === 0 ||
            !campaignName ||
            !messageTemplate
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-green-600"
          }`}
        >
          {isLoading
            ? "Sending Messages..."
            : `Send Messages (${selectedContacts.length} contacts)`}
        </button>
      </div>
    </div>
  );
};

export default BulkMessageSender;
