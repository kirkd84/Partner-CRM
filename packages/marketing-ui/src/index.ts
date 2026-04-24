/**
 * @partnerradar/marketing-ui
 *
 * React components that Marketing Wizard ships — both to the embedded
 * /studio surface in apps/web AND, eventually, apps/marketing-wizard.
 *
 * Keep zero runtime dependencies on PartnerRadar-specific packages
 * beyond packages/ui primitives + packages/types. That preserves
 * the extraction contract.
 *
 * MW-2+ will export:
 *   • BrandSetupWizard
 *   • DesignCanvas (Fabric/Konva wrapper)
 *   • ChatRefineDrawer
 *   • TemplatePicker
 *   • ExportDialog
 */

export const MARKETING_UI_VERSION = '0.1.0-scaffold';

// MW-2 polish / MW-3 template primitive.
export { BrandPreview } from './BrandPreview';
export type { BrandPreviewVariant, BrandPreviewProps } from './BrandPreview';
