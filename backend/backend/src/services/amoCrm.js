import axios from 'axios';
import logger from '../utils/logger.js';

class AmoCrmService {
  constructor() {
    this.domain = process.env.AMO_DOMAIN; // e.g., 'example.amocrm.ru'
    this.accessToken = process.env.AMO_ACCESS_TOKEN;
  }

  async createLead({ name, contact, type }) {
    logger.info('Received new lead', { name, contact, type });

    if (!this.domain || !this.accessToken) {
      logger.warn('AmoCRM credentials not found. Lead saved to logs only.', {
        domain: !!this.domain,
        token: !!this.accessToken
      });
      return { success: true, mode: 'offline' };
    }

    try {
      const client = axios.create({
        baseURL: `https://${this.domain}/api/v4`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // 1. Create Contact
      const contactResponse = await client.post('/contacts', [
        {
          name: name,
          custom_fields_values: [
            {
              field_code: 'PHONE',
              values: [{ value: contact }]
            },
            {
                field_code: 'EMAIL',
                 values: [{ value: type === 'telegram' ? `${contact}@telegram.user` : '' }]
            }
          ]
        }
      ]);

      const contactId = contactResponse.data._embedded.contacts[0].id;

      // 2. Create Lead linked to Contact
      const leadResponse = await client.post('/leads', [
        {
          name: 'Заявка с лендинга (Telegram Scanner)',
          price: 0,
          _embedded: {
            contacts: [
              {
                id: contactId
              }
            ]
          }
        }
      ]);

      logger.info('Successfully created lead in AmoCRM', { 
        leadId: leadResponse.data._embedded.leads[0].id,
        contactId 
      });

      return { success: true, leadId: leadResponse.data._embedded.leads[0].id };

    } catch (error) {
      logger.error('Error sending lead to AmoCRM', { 
        error: error.message,
        response: error.response?.data 
      });
      // Don't fail the user request if CRM fails, just log it
      return { success: false, error: error.message };
    }
  }
}

export default new AmoCrmService();

