export const EZFLOW_LOGO_SRC = '/assets/aistudio/WhatsApp_Image_2026-11-24_at_12.30.24_68907579.jpeg';

interface EzFlowLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<EzFlowLogoProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-lg p-0.5',
  md: 'w-9 h-9 rounded-xl p-0.5',
  lg: 'w-12 h-12 rounded-xl p-1',
  xl: 'w-14 h-14 rounded-2xl p-1',
};

export function EzFlowLogo({ size = 'md', tone = 'light', className = '' }: EzFlowLogoProps) {
  const toneClasses =
    tone === 'dark'
      ? 'bg-white border border-white/20 shadow-sm'
      : 'bg-white border border-slate-200/90 shadow-xs';

  return (
    <div
      className={`flex items-center justify-center overflow-hidden shrink-0 ${toneClasses} ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={EZFLOW_LOGO_SRC}
        alt="Logo EzFlow"
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain select-none"
        draggable={false}
      />
    </div>
  );
}
