import { Avatar } from './Avatar';

export interface ActivityItemProps {
  userName: string;
  userColor?: string;
  verb: string;
  partnerName?: string;
  partnerHref?: string;
  body?: string;
  timestamp: string;
}

export function ActivityItem({
  userName,
  userColor,
  verb,
  partnerName,
  partnerHref,
  body,
  timestamp,
}: ActivityItemProps) {
  return (
    <div className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0">
      <Avatar name={userName} color={userColor} size="md" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 leading-snug">
          <span className="font-semibold">{userName}</span>{' '}
          <span className="text-gray-600">{verb}</span>
          {partnerName && (
            <>
              {' '}
              <a
                href={partnerHref ?? '#'}
                className="inline-flex items-center rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium hover:bg-blue-100"
              >
                {partnerName}
              </a>
            </>
          )}
          <span className="text-xs text-gray-400 ml-2">{timestamp}</span>
        </div>
        {body && <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{body}</div>}
      </div>
    </div>
  );
}
