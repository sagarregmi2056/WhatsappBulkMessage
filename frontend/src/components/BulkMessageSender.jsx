import { useState } from "react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import axios from "axios";
import WhatsAppStatus from "./WhatsAppStatus";

const BulkMessageSender = () => {
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Reset form function
  const resetForm = () => {
    setCampaignName("");
    setMessageTemplate("");
    setMediaFile(null);
    setMediaType("");
    setContacts([]);
    setSelectedContacts([]);
    setFileName("");
    setSearchTerm("");

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
          .filter((row) => {
            // Get the name and phone values, handling different possible column names
            const name = row.Name || row.name;
            const phone = row.Phone || row.phone;

            // Clean and validate the entry
            return (
              name &&
              phone &&
              name.trim() !== "" &&
              phone.toString().trim() !== ""
            );
          })
          .map((row) => {
            // Clean up phone number: remove quotes, spaces, and any non-numeric characters except +
            let phoneNumber = row.Phone || row.phone;
            phoneNumber = phoneNumber
              .toString()
              .replace(/['"]/g, "") // Remove quotes
              .trim(); // Remove leading/trailing spaces

            return {
              name: (row.Name || row.name).trim(),
              phoneNumber: phoneNumber,
            };
          });

        if (validContacts.length === 0) {
          toast.error("No valid contacts found in CSV");
          return;
        }

        console.log("Processed contacts:", validContacts);
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

  const handleContactSelection = (phoneNumber) => {
    setSelectedContacts((prev) =>
      prev.includes(phoneNumber)
        ? prev.filter((p) => p !== phoneNumber)
        : [...prev, phoneNumber]
    );
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedContacts(filteredContacts.map((c) => c.phoneNumber));
    } else {
      setSelectedContacts([]);
    }
  };

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phoneNumber.includes(searchTerm)
  );

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
        "http://localhost:8989/api/send-messages",
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

        {/* Contacts List */}
        {contacts.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">Contacts</h3>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="p-2 border rounded"
                />
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredContacts.length > 0 &&
                      filteredContacts.every((contact) =>
                        selectedContacts.includes(contact.phoneNumber)
                      )
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="mr-2"
                  />
                  Select All
                </label>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Select
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Phone Number
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredContacts.map((contact, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(
                            contact.phoneNumber
                          )}
                          onChange={() =>
                            handleContactSelection(contact.phoneNumber)
                          }
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {contact.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {contact.phoneNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {selectedContacts.length} of {contacts.length} contacts selected
            </p>
          </div>
        )}

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
