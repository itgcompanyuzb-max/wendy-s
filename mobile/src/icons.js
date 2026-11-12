// The same line icons as the website (public/icons.js), drawn natively.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const S = ({ size = 24, color = '#fff', width = 2, children, fill = 'none' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</Svg>
);

export const Search = (p) => <S {...p}><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-4-4" /></S>;
export const Down = (p) => <S {...p}><Path d="M5 9l7 7 7-7" /></S>;
export const Plus = (p) => <S {...p}><Path d="M12 4v16M4 12h16" /></S>;
export const Minus = (p) => <S {...p}><Path d="M4 12h16" /></S>;
export const X = (p) => <S {...p}><Path d="M6 6l12 12M18 6L6 18" /></S>;
export const Trash = (p) => <S {...p}><Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>;
export const Qr = (p) => <S {...p}><Rect x="3" y="3" width="7" height="7" rx="2" /><Rect x="14" y="3" width="7" height="7" rx="2" /><Rect x="3" y="14" width="7" height="7" rx="2" /><Path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3h-1" /></S>;
export const Walk = (p) => <S {...p}><Circle cx="13" cy="4" r="2" /><Path d="M7 21l3-6 3 2v4M10 15l1-6 4 3 3 1M11 9L8 11v3" /></S>;
export const Fork = (p) => <S {...p}><Path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 21V3c-2 1-3 4-3 8h3" /></S>;
export const Bag = ({ size = 26, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 8h14l-1 12H6z" fill={color} /><Path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke={color} strokeWidth="2" /></Svg>
);
export const Receipt = ({ size = 26, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4z" fill={color} /><Path d="M9 8h6M9 12h6M9 16h3" stroke="#e2203d" strokeWidth="1.8" /></Svg>
);
export const Percent = (p) => <S {...p}><Path d="M19 5L5 19" /><Circle cx="6.5" cy="6.5" r="2.5" /><Circle cx="17.5" cy="17.5" r="2.5" /></S>;
export const Gift = (p) => <S {...p}><Rect x="3" y="8" width="18" height="13" rx="2" /><Path d="M12 8v13M3 12h18M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zM12 8c1.5-3 5-4 5-1.5S14 8 12 8z" /></S>;
export const Check = (p) => <S {...p}><Path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
