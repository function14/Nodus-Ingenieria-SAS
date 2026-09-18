-- Variables de la comunicacion: permiten re-renderizar la plantilla POR LECTOR
-- y aplicar el masking (un aviso de difusion es una sola fila que distintos
-- roles deben ver distinta).
ALTER TABLE "Notification" ADD COLUMN "vars" JSONB;

-- La lectura de notificaciones ahora filtra por rol destinatario, y el envio
-- diferido de correo busca las pendientes por canal/estado.
CREATE INDEX "Notification_tenantId_recipientRole_userId_idx"
  ON "Notification"("tenantId", "recipientRole", "userId");
CREATE INDEX "Notification_tenantId_channel_deliveryStatus_idx"
  ON "Notification"("tenantId", "channel", "deliveryStatus");
