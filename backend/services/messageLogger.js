const fs = require("fs");
const path = require("path");
const readline = require("readline");

class MessageLogger {
  constructor() {
    this.logsDir = path.join(__dirname, "../logs");
    this.logFile = path.join(this.logsDir, "message_logs.txt");
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir);
    }
  }

  async logCampaign(campaignData) {
    setImmediate(async () => {
      try {
        const logEntry = {
          campaignName: campaignData.campaignName,
          timestamp: campaignData.timestamp,
          messageTemplate: campaignData.messageTemplate,
          successful: campaignData.details.results.map((r) => ({
            name: r.contact.name,
            phoneNumber: r.contact.phoneNumber,
            formattedNumber: r.formattedNumber,
            actualMessage: r.personalizedMessage, // This captures the actual sent message
            timestamp: r.timestamp,
          })),
          failed:
            campaignData.details.errors?.map((e) => ({
              name: e.contact.name,
              phoneNumber: e.contact.phoneNumber,
              error: e.error,
              timestamp: e.timestamp,
            })) || [],
          statistics: campaignData.statistics,
        };

        const logLine = JSON.stringify(logEntry) + "\n---END_ENTRY---\n";
        await fs.promises.appendFile(this.logFile, logLine);
      } catch (error) {
        console.error("Error logging campaign:", error);
      }
    });
  }

  createPersonalizedMessage(template, name) {
    return template.replace(/{name}/g, name.trim());
  }

  async getCampaigns(page = 1, limit = 10000) {
    try {
      const fileStream = fs.createReadStream(this.logFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const campaigns = [];
      let entry = "";

      for await (const line of rl) {
        if (line === "---END_ENTRY---") {
          if (entry) {
            const campaign = JSON.parse(entry);
            campaigns.push({
              campaignName: campaign.campaignName,
              timestamp: campaign.timestamp,
              statistics: campaign.statistics,
              messageTemplate: campaign.messageTemplate,
            });
          }
          entry = "";
        } else {
          entry += line;
        }
      }

      return {
        campaigns: campaigns.reverse(),
        total: campaigns.length,
      };
    } catch (error) {
      console.error("Error reading campaigns:", error);
      return { campaigns: [], total: 0 };
    }
  }

  async getCampaignDetails(timestamp) {
    try {
      const fileStream = fs.createReadStream(this.logFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let entry = "";
      for await (const line of rl) {
        if (line === "---END_ENTRY---") {
          if (entry) {
            const campaign = JSON.parse(entry);
            if (campaign.timestamp === timestamp) {
              return campaign;
            }
          }
          entry = "";
        } else {
          entry += line;
        }
      }
      throw new Error("Campaign not found");
    } catch (error) {
      console.error("Error getting campaign details:", error);
      throw error;
    }
  }

  async searchCampaigns(query) {
    try {
      const fileStream = fs.createReadStream(this.logFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const results = [];
      let entry = "";

      for await (const line of rl) {
        if (line === "---END_ENTRY---") {
          if (entry) {
            const campaign = JSON.parse(entry);
            const searchText = query.toLowerCase();

            if (
              campaign.campaignName.toLowerCase().includes(searchText) ||
              campaign.messageTemplate.toLowerCase().includes(searchText) ||
              campaign.successful.some(
                (m) =>
                  m.name.toLowerCase().includes(searchText) ||
                  m.phoneNumber.includes(searchText) ||
                  m.message.toLowerCase().includes(searchText)
              ) ||
              campaign.failed.some(
                (m) =>
                  m.name.toLowerCase().includes(searchText) ||
                  m.phoneNumber.includes(searchText) ||
                  m.message.toLowerCase().includes(searchText)
              )
            ) {
              results.push(campaign);
            }
          }
          entry = "";
        } else {
          entry += line;
        }
      }

      return results;
    } catch (error) {
      console.error("Error searching campaigns:", error);
      return [];
    }
  }
}

module.exports = new MessageLogger();
