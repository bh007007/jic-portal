// JIC 포털을 이루는 4개 포털의 주소(2026-11-08 구조: 관리자(인트라넷 포함)·학생·에이전시·강사, DB는 Supabase 하나).
// 관리자 포털·인트라넷·강사 포털은 이 Pages 프로젝트 주소 아래에 있어 직원은 한 번 로그인으로 오간다(원칙 C6).
// 학생·에이전시 포털은 Cloudflare Workers 주소다. 회사 도메인을 연결하면 VITE_*_URL 만 바꾼다.
const dev = import.meta.env.DEV;

export const ADMIN_PATH = '/admin';

export interface Portal {
  key: 'admin' | 'student' | 'agency' | 'teacher';
  name: string;
  users: string;
  url: string | null; // null = 준비 중
  sub?: { label: string; url: string }[];
}

export const PORTALS: Portal[] = [
  {
    key: 'admin',
    name: '관리자 포털',
    users: '직원 · 관리자',
    url: `${ADMIN_PATH}/`,
    sub: [
      { label: '인트라넷', url: import.meta.env.VITE_INTRANET_URL ?? (dev ? 'http://127.0.0.1:5177' : '/intranet/') },
      { label: '가드 태블릿', url: import.meta.env.VITE_INTRANET_URL ? `${import.meta.env.VITE_INTRANET_URL.replace(/\/+$/, '')}/guard` : dev ? 'http://127.0.0.1:5177/guard' : '/intranet/guard' },
    ],
  },
  {
    key: 'student',
    name: '학생 포털',
    users: '재학생 · 입학 예정 학생',
    url: import.meta.env.VITE_STUDENT_URL ?? (dev ? 'http://127.0.0.1:5176' : 'https://jic-student.bh007007.workers.dev'),
  },
  {
    key: 'agency',
    name: '에이전시 포털',
    users: '유학원 · 에이전시 지점',
    url: import.meta.env.VITE_PARTNER_URL ?? (dev ? 'http://127.0.0.1:5175' : 'https://jic-partner.bh007007.workers.dev'),
  },
  {
    key: 'teacher',
    name: '강사 포털',
    users: '강사 · 체커 · 스케줄러 (LMS)',
    url: import.meta.env.VITE_TEACHER_URL ?? null,
  },
];
