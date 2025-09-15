# WhatsApp Integration Setup and Maintenance

## Overview

This document provides instructions for setting up and maintaining the WhatsApp Cloud API integration for StockSmartHub. The WhatsApp integration allows the system to receive and process messages from customers, handle product inquiries, manage orders, and update stock levels directly through WhatsApp.

## Initial Setup

1. **Create a Meta Developer Account**
   - Go to [Meta for Developers](https://developers.facebook.com/)
   - Create a new app or use an existing one

2. **Set Up WhatsApp Business API**
   - Navigate to your app dashboard
   - Add the WhatsApp product to your app
   - Follow the setup instructions to connect a phone number

3. **Configure Webhook**
   - Set up a webhook URL in your Meta Developer dashboard
   - Use the webhook verification token from your `.env` file
   - Subscribe to the necessary webhook events (messages, message_status)

4. **Generate Access Tokens**
   - Generate a permanent access token from the WhatsApp API setup page
   - Note both the access token and refresh token

5. **Update Environment Variables**
   - Update the `.env` file with your tokens and app credentials

## Token Management

### Understanding Token Expiration

WhatsApp API tokens have expiration periods:
- Access tokens typically expire after 24 hours
- Refresh tokens can last up to 60 days

### Token Refresh Process

The system automatically attempts to refresh the access token when:
1. A token is detected as expired before sending a message
2. A WhatsApp API call returns a token expiration error

### Handling Expired Refresh Tokens

When both access and refresh tokens expire:

1. The system will log errors in the database and console
2. WhatsApp functionality will be temporarily unavailable
3. You'll need to manually generate new tokens

## Generating New Tokens

When you receive token expiration notifications:

1. Go to https://developers.facebook.com/apps/{your-app-id}/whatsapp-business/
2. Navigate to API Setup
3. Generate a new Permanent Access Token
4. Update the `.env` file with the new tokens:
   ```
   WHATSAPP_ACCESS_TOKEN=your_new_access_token
   WHATSAPP_REFRESH_TOKEN=your_new_refresh_token
   WHATSAPP_TOKEN_EXPIRY=0  # Will be auto-updated on first use
   ```
5. Restart the application

## Troubleshooting

### Common Issues

1. **Token Expiration Errors**
   - Error message: `Error validating access token: Session has expired`
   - Solution: Generate new tokens as described above

2. **Webhook Verification Failures**
   - Check that your webhook URL is accessible
   - Verify that the webhook token matches your `.env` file

3. **Message Delivery Failures**
   - Check the WhatsApp logs in the admin dashboard
   - Verify that your phone number ID is correct
   - Ensure your WhatsApp Business Account is in good standing

### Monitoring

The system logs WhatsApp-related events in two places:

1. **Console Logs**: Check server logs for real-time error messages
2. **Database Logs**: The admin dashboard displays WhatsApp activity logs

## Best Practices

1. **Regular Token Rotation**
   - Set a calendar reminder to refresh tokens before they expire
   - Consider implementing a notification system for admins

2. **Error Handling**
   - The system will continue to log incoming messages even when tokens are expired
   - Check the admin dashboard regularly for any error notifications

3. **Testing**
   - After updating tokens, send a test message to verify functionality
   - Monitor the logs to ensure messages are being processed correctly