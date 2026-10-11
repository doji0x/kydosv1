import type * as React from 'react';
import type useEmblaCarousel from 'embla-carousel-react';
import type { LegendProps, ResponsiveContainer, TooltipProps } from 'recharts';
import type { parseWixMediaUrl } from '../components/ui/image-helpers';

/** CSS custom properties without admitting arbitrary misspelled CSS fields. */
export type CSSVariables = React.CSSProperties & {
  [property: `--${string}`]: string | number;
};

export type ChartConfig = Record<string, {
  label?: React.ReactNode;
  icon?: React.ComponentType;
  color?: string;
  theme?: Partial<Record<'light' | 'dark', string>>;
}>;
export interface ChartContextValue { config: ChartConfig }
export type ChartContainerProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>['children'];
};
export type ChartTooltipContentProps = TooltipProps<number | string | Array<number | string>, string | number> &
  React.ComponentPropsWithoutRef<'div'> & {
    indicator?: 'dot' | 'line' | 'dashed';
    hideLabel?: boolean;
    hideIndicator?: boolean;
    labelClassName?: string;
    nameKey?: string;
    labelKey?: string;
  };
export type ChartLegendContentProps = React.ComponentPropsWithoutRef<'div'> &
  Pick<LegendProps, 'payload' | 'verticalAlign'> & {
    hideIcon?: boolean;
    nameKey?: string;
  };

export type CarouselApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
export type CarouselProps = React.ComponentPropsWithoutRef<'div'> & {
  orientation?: 'horizontal' | 'vertical';
  opts?: Parameters<typeof useEmblaCarousel>[0];
  plugins?: Parameters<typeof useEmblaCarousel>[1];
  setApi?: (api: CarouselApi) => void;
};
export type CarouselContextValue = Pick<CarouselProps, 'opts' | 'orientation'> & {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi | undefined;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
};
export interface SidebarContextValue {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  toggleSidebar: () => void;
}
export type SidebarProviderProps = React.ComponentPropsWithoutRef<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
export type SidebarProps = React.ComponentPropsWithoutRef<'div'> & {
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
};
export type ImageProps = React.ComponentPropsWithoutRef<'img'> & {
  fittingType?: 'fill' | 'fit';
  originWidth?: number;
  originHeight?: number;
  focalPointX?: number;
  focalPointY?: number;
  quality?: number;
};
export type ResponsiveImageProps = React.ComponentPropsWithoutRef<'img'> & {
  parsed: NonNullable<ReturnType<typeof parseWixMediaUrl>>;
  fittingType?: 'fill' | 'fit';
  focalPoint?: { x: number; y: number };
  quality?: number;
  aspectRatio?: React.CSSProperties['aspectRatio'];
  onSourceChange: (src: string, className: string) => void;
};
