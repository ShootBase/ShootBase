import type { ComponentType } from 'react'
import { template as newMessageTemplate } from './new-message'
import { template as leadMatchTemplate } from './lead-match'
import { template as leadDigestTemplate } from './lead-digest'
import { template as proContactRequestTemplate } from './pro-contact-request'
import { template as hireCongratsTemplate } from './hire-congrats'
import { template as invoiceTemplate } from './invoice'
import { template as supportTicketNotifyTemplate } from './support-ticket-notify'
import { template as supportTicketConfirmationTemplate } from './support-ticket-confirmation'
import { template as supportReplyTemplate } from './support-reply'
import { template as staffInviteTemplate } from './staff-invite'
import { template as creditReceiptTemplate } from './credit-receipt'
import { template as leadDisputeApprovedTemplate } from './lead-dispute-approved'
import { template as leadDisputeRejectedTemplate } from './lead-dispute-rejected'
import { template as leadDisputeSubmittedTemplate } from './lead-dispute-submitted'
import { template as adminAlertTemplate } from './admin-alert'
import { template as jobPostedConfirmationTemplate } from './job-posted-confirmation'
import { template as proVerifiedTemplate } from './pro-verified'
import { template as bankTransferSubmittedTemplate } from './bank-transfer-submitted'
import { template as bankTransferApprovedTemplate } from './bank-transfer-approved'
import { template as bankTransferRejectedTemplate } from './bank-transfer-rejected'
import { template as bankTransferMoreInfoTemplate } from './bank-transfer-more-info'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-message': newMessageTemplate,
  'lead-match': leadMatchTemplate,
  'lead-digest': leadDigestTemplate,
  'pro-contact-request': proContactRequestTemplate,
  'hire-congrats': hireCongratsTemplate,
  'invoice': invoiceTemplate,
  'support-ticket-notify': supportTicketNotifyTemplate,
  'support-ticket-confirmation': supportTicketConfirmationTemplate,
  'support-reply': supportReplyTemplate,
  'staff-invite': staffInviteTemplate,
  'credit-receipt': creditReceiptTemplate,
  'lead-dispute-approved': leadDisputeApprovedTemplate,
  'lead-dispute-rejected': leadDisputeRejectedTemplate,
  'lead-dispute-submitted': leadDisputeSubmittedTemplate,
  'admin-alert': adminAlertTemplate,
  'job-posted-confirmation': jobPostedConfirmationTemplate,
  'pro-verified': proVerifiedTemplate,
  'bank-transfer-submitted': bankTransferSubmittedTemplate,
  'bank-transfer-approved': bankTransferApprovedTemplate,
  'bank-transfer-rejected': bankTransferRejectedTemplate,
  'bank-transfer-more-info': bankTransferMoreInfoTemplate,
}
