import './style.css';
import './collection.css';
import './index.css';
import './workbench.css';

export const metadata = {
  title: '数学难度研究室',
  description: '从原题到推理，理解数学试题的难度与教学价值。',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#f5f3ec',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#content">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
