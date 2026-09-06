-- A retry from the same sender returns the original message, including after a lost response.
ALTER TABLE direct_messages ADD COLUMN client_message_key TEXT;
CREATE UNIQUE INDEX direct_messages_sender_client_key_unique
ON direct_messages(sender_email, client_message_key)
WHERE client_message_key IS NOT NULL;
