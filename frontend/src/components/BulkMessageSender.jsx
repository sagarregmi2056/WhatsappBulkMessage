import { useState } from 'react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import axios from 'axios';
import WhatsAppStatus from './WhatsAppStatus';

const validateCSVFormat = (data) => {
    if (data.length === 0) {
        return false;
    }

    // Check if the first row has the required columns
    const firstRow = data[0];
    const hasRequiredColumns = 'name' in firstRow && 'phoneNumber' in firstRow;

    if (!hasRequiredColumns) {
        // Check if columns might be using different cases
        const columns = Object.keys(firstRow).map(key => key.toLowerCase());
        const hasNameColumn = columns.includes('name');
        const hasPhoneColumn = columns.some(col =>
            col.includes('phone') || col.includes('number') || col.includes('mobile')
        );

        if (hasNameColumn && hasPhoneColumn) {
            // Map the actual column names to our expected format
            return data.map(row => {
                const nameKey = Object.keys(row).find(key =>
                    key.toLowerCase() === 'name'
                );
                const phoneKey = Object.keys(row).find(key =>
                    key.toLowerCase().includes('phone') ||
                    key.toLowerCase().includes('number') ||
                    key.toLowerCase().includes('mobile')
                );

                return {
                    name: row[nameKey],
                    phoneNumber: row[phoneKey]
                };
            });
        }

        return false;
    }

    return data;
};

const BulkMessageSender = () => {
    const [contacts, setContacts] = useState([]);
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [campaignName, setCampaignName] = useState('');
    const [messageTemplate, setMessageTemplate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [fileName, setFileName] = useState('');

    const handleCSVUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            setFileName(file.name);
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    console.log('Raw CSV data:', results.data);

                    const validData = validateCSVFormat(results.data);
                    if (!validData) {
                        toast.error('Invalid CSV format. Please ensure your CSV has "name" and "phoneNumber" columns');
                        return;
                    }

                    const validContacts = validData.filter(contact =>
                        contact.name &&
                        contact.phoneNumber &&
                        contact.name.trim() !== '' &&
                        contact.phoneNumber.trim() !== ''
                    );

                    console.log('Valid contacts:', validContacts);

                    if (validContacts.length === 0) {
                        toast.error('No valid contacts found in CSV');
                        return;
                    }

                    setContacts(validContacts);
                    setSelectedContacts(validContacts.map(contact => contact.phoneNumber));
                    toast.success(`Loaded ${validContacts.length} contacts`);
                },
                error: (error) => {
                    toast.error(`Error parsing CSV file: ${error.message}`);
                    console.error('CSV parsing error:', error);
                }
            });
        }
    };

    const handleSendMessages = async () => {
        if (!campaignName || !messageTemplate || selectedContacts.length === 0) {
            toast.error('Please fill all required fields');
            return;
        }

        setIsLoading(true);
        try {
            const selectedContactsData = contacts.filter(c =>
                selectedContacts.includes(c.phoneNumber)
            );

            const response = await axios.post('http://localhost:3000/api/send-messages', {
                campaignName,
                messageTemplate,
                contacts: selectedContactsData
            }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            toast.success('Messages sent successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error sending messages');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <WhatsAppStatus />

            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">WhatsApp Bulk Sender</h2>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload CSV File
                    </label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <div className="mt-2 text-sm text-gray-600">
                        <p>CSV should have the following format:</p>
                        <pre className="bg-gray-50 p-2 mt-1 rounded">
                            name,phoneNumber
                            John Doe,1234567890
                            Jane Smith,9876543210
                        </pre>
                    </div>
                    {fileName && (
                        <p className="mt-2 text-sm text-gray-600">
                            Loaded file: {fileName}
                        </p>
                    )}
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Campaign Name
                    </label>
                    <input
                        type="text"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        className="w-full p-2 border rounded"
                        placeholder="Enter campaign name"
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Message Template
                    </label>
                    <textarea
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        className="w-full p-2 border rounded h-32"
                        placeholder="Enter message template (use {name} for personalization)"
                    />
                </div>

                {contacts.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Contacts ({selectedContacts.length} selected)
                        </label>
                        <div className="max-h-60 overflow-y-auto border rounded p-2">
                            {contacts.map((contact) => (
                                <div key={contact.phoneNumber} className="flex items-center p-2 hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedContacts.includes(contact.phoneNumber)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedContacts([...selectedContacts, contact.phoneNumber]);
                                            } else {
                                                setSelectedContacts(selectedContacts.filter(num => num !== contact.phoneNumber));
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span>{contact.name} - {contact.phoneNumber}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={handleSendMessages}
                    disabled={isLoading || selectedContacts.length === 0 || !campaignName || !messageTemplate}
                    className={`bg-green-500 text-white px-4 py-2 rounded ${(isLoading || selectedContacts.length === 0 || !campaignName || !messageTemplate)
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-green-600'
                        }`}
                >
                    {isLoading ? 'Sending...' : 'Send Messages'}
                </button>
            </div>
        </div>
    );
};

export default BulkMessageSender;