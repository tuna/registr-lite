import { h, render } from 'preact';
import htm from 'htm';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { Temporal } from '@js-temporal/polyfill';

const html = htm.bind(h);

const storedToken = localStorage.getItem('token');

type Entry = {
  id: number,
  email: String,
  nickname: String,
  dept?: String,
  studentId?: String,
  createdAt: String,
  emailed: boolean,
  archived: boolean,
}

function Main() {
  const [token, setToken] = useState(storedToken);
  const tokenKeydown = useCallback((e: KeyboardEvent) => {
    if(e.key === 'Enter') {
      const input = e.currentTarget as HTMLInputElement;
      const newToken = input.value;
      if(newToken) {
        localStorage.setItem('token', newToken);
        setToken(newToken);
      }
    }
  }, []);

  const [entries, setEntries] = useState<null | Entry[]>(null);
  function refetch() {
    setEntries(null);
    fetch('/api/list', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(res => res.json()).then(setEntries);
  }
  useEffect(() => {
    if (token) {
      refetch();
    }
  }, [token])

  const [showAll, setShowAll] = useState(false);

  if (token === null) {
    return html`
      <label for="token">Admin Token:</label>
      <input id="token" type="password" onKeydown=${tokenKeydown} />
    `;
  } else if (entries === null) {
    return html`<p>Loading...</p>`;
  }
  const rendered = entries?.map(e => {
    if (!showAll && e.archived) return null;

    // Parse createdAt using Temporal API. If not specified, default timezone is UTC
    const createdAt = Temporal.Instant.from(e.createdAt + 'Z');
    // Render as ISO string
    const localCreatedAt = createdAt.toString({
      timeZone: '+0800',
    });

    const emailIcon = e.emailed ? 'mark_email_read' : 'drafts';
    const emailBtn = html`<span class="material-symbols-outlined email" onClick=${() => {
      console.log(`TODO: email ${e.id}`);
    }}>${emailIcon}</span>`;

    const archiveIcon = e.archived ? 'bookmark' : 'inventory_2';
    const archiveBtn = html`<span class="material-symbols-outlined archive" onClick=${() => {
      console.log(`TODO: toggle archive ${e.id}`);
    }}>${archiveIcon}</span>`;

    return html`
      <tr>
        <td><input type="checkbox" /> ${e.id}</td>
        <td>${e.email}</td>
        <td>${e.nickname}</td>
        <td>${e.dept ?? ''}</td>
        <td>${e.studentId ?? ''}</td>
        <td>${localCreatedAt}</td>
        <td>${emailBtn}${archiveBtn}</td>
      </tr>
    `;
  });

  return html`
    <button onClick=${refetch}>Refresh</button>
    <label><input type="checkbox" checked=${showAll} onChange=${() => setShowAll(s => !s)} /> Show archived</label>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Email</th>
          <th>Nickname</th>
          <th>Department</th>
          <th>Student ID</th>
          <th>Created At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rendered}
      </tbody>
    </table>
  `;
}

function bootstrap() {
  const mountpt = document.getElementById('app');
  if (!mountpt) return;

  render(html`<${Main} />`, mountpt);
}

document.addEventListener('DOMContentLoaded', bootstrap);