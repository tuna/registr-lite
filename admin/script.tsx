import { h, render } from 'preact';
import htm from 'htm';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { Temporal } from '@js-temporal/polyfill';
import { Set } from 'immutable';

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
  const [selected, setSelected] = useState<Set<number>>(Set.of());

  if (token === null) {
    return html`
      <label for="token">Admin Token:</label>
      <input id="token" type="password" onKeydown=${tokenKeydown} />
    `;
  } else if (entries === null) {
    return html`<p>Loading...</p>`;
  }

  const doEmail = (id: number) => {
    fetch('/api/mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    }).then(res => {
      if(res.ok) {
        refetch();
      } else {
        alert('Failed to send email');
      }
    });
  };

  const doArchive = (id: number, archived: boolean) => {
    fetch('/api/archive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ id, archived }),
    }).then(res => {
      if(res.ok) {
        refetch();
      } else {
        alert('Failed to update archive status');
      }
    });
  };

  const visibles = showAll ? entries : entries.filter(e => !e.archived);
  const rendered = visibles.map(e => {
    // Parse createdAt using Temporal API. If not specified, default timezone is UTC
    const createdAt = Temporal.Instant.from(e.createdAt + 'Z');
    // Render as ISO string
    const localCreatedAt = createdAt.toString({
      timeZone: '+0800',
    });

    const emailIcon = e.emailed ? 'mark_email_read' : 'send';
    const emailBtn = html`<span class="material-symbols-outlined email" onClick=${() => {
      doEmail(e.id);
    }}>${emailIcon}</span>`;

    const archiveIcon = e.archived ? 'bookmark' : 'inventory_2';
    const archiveBtn = html`<span class="material-symbols-outlined archive" onClick=${() => {
      doArchive(e.id, !e.archived);
    }}>${archiveIcon}</span>`;

    return html`
      <tr class=${e.archived ? 'archived' : ''}>
        <td><input
          type="checkbox"
          checked=${selected.contains(e.id)}
          onChange=${(ev: Event) => {
            const checked = (ev.currentTarget as HTMLInputElement).checked;
            setSelected(s => checked ? s.add(e.id) : s.remove(e.id));
          }}
        /></td>
        <td>${e.id}</td>
        <td>${e.email}</td>
        <td>${e.nickname}</td>
        <td>${e.dept ?? ''}</td>
        <td>${e.studentId ?? ''}</td>
        <td>${localCreatedAt}</td>
        <td>${emailBtn}${archiveBtn}</td>
      </tr>
    `;
  });

  const refreshBtn = html`<span class="material-symbols-outlined" onClick=${refetch}>refresh</span>`;
  const disabled = selected.size === 0;
  const sendAllBtn = html`<span class="material-symbols-outlined ${disabled ? 'disabled' : ''}" onClick=${() => {
    Promise.all(selected.map(id => doEmail(id))).then(() => {
      refetch();
    });
  }}>send</span>`;
  const archiveAllBtn = html`<span class="material-symbols-outlined ${disabled ? 'disabled' : ''}" onClick=${() => {
    Promise.all(selected.map(id => doArchive(id, true))).then(() => {
      refetch();
    });
  }}>inventory_2</span>`;
  const unarchiveAllBtn = html`<span class="material-symbols-outlined ${disabled ? 'disabled' : ''} " onClick=${() => {
    Promise.all(selected.map(id => doArchive(id, false))).then(() => {
      refetch();
    });
  }}>bookmark</span>`;
  const logoutBtn = html`<span class="material-symbols-outlined" onClick=${() => {
    localStorage.removeItem('token');
    setToken(null);
  }}>logout</span>`;
  const settingsBtn = html`<span class="material-symbols-outlined" onClick=${() => {
    const dialog = document.getElementById('config-dialog') as HTMLDialogElement | null;
    if (dialog) {
      dialog.showModal();
    }
  }}>settings</span>`;

  const allSelected = visibles.length === selected.size && visibles.length > 0;

  return html`
    <div class="toolbar">
      ${refreshBtn}${logoutBtn}${settingsBtn}
      <span class="spacer"></span>
      ${sendAllBtn}${archiveAllBtn}${unarchiveAllBtn}
      <span class="spacer"></span>
      <input id="showall" type="checkbox" checked=${showAll} onChange=${() => {
        setShowAll(s => !s)
        setSelected(Set.of());
      }} /> <label for="showall">Show archived</label>
    </div>
    <dialog id="config-dialog" onClick=${(e: Event) => {
      if (e.target === e.currentTarget) {
        (e.currentTarget as HTMLDialogElement).close();
      }
    }}>
      <div class="dialog-inner">
        <${Config} token=${token} />
      </div>
    </dialog>
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" disabled=${visibles.length === 0} checked=${allSelected} onChange=${() => {
            const checked = !allSelected;
            setSelected(checked ? Set(visibles.map(e => e.id)) : Set());
          }} /></th>
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

function Config(props: { token: string }) {
  const token = props.token;
  const [allCfgs, setAllCfgs] = useState<{ key: string, value: string }[] | null>(null);
  const refetch = useCallback(() => {
    setAllCfgs(null);
    if (!token) return;
    fetch('/api/config', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'same-origin',
    }).then(res => res.json()).then(setAllCfgs);
  }, [token]);
  
  useEffect(() => {
    refetch();
  }, [refetch]);

  if (allCfgs === null) {
    return html`<p>Loading...</p>`;
  }

  const update = (key: string) => {
    const value = (document.querySelector(`[name="${key}"]`) as HTMLInputElement | null)?.value;
    if (value === undefined || value === null)
      throw new Error('Bad frontend dev!');

    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, value }),
    }).then(res => {
      if(res.ok) {
        refetch();
      } else {
        alert('Failed to update configuration');
      }
    });
  }

  function getCfg(name: string): string {
    if (!allCfgs) return '';
    const cfg = allCfgs.find(c => c.key === name);
    return cfg ? cfg.value : '';
  }

  return html`
    <label>Bot Groups (comma separated):</label>
    <input name="bot_groups" value=${getCfg('bot_groups')} type="text" />
    <button onClick=${() => update('bot_groups')}>Update</button>

    <label>Trusted Domains (comma separated):</label>
    <input name="trusted_domains" value=${getCfg('trusted_domains')} type="text" />
    <button onClick=${() => update('trusted_domains')}>Update</button>

    <label>SMTP server</label>
    <input name="smtp_server" value=${getCfg('smtp_server')} type="text" />
    <button onClick=${() => update('smtp_server')}>Update</button>

    <label>SMTP username</label>
    <input name="smtp_username" value=${getCfg('smtp_username')} type="text" />
    <button onClick=${() => update('smtp_username')}>Update</button>

    <label>SMTP password</label>
    <input name="smtp_password" value=${getCfg('smtp_password')} type="password" />
    <button onClick=${() => update('smtp_password')}>Update</button>

    <label>Email FROM</label>
    <input name="email_from" value=${getCfg('email_from')} type="text" />
    <button onClick=${() => update('email_from')}>Update</button>

    <label>Email Title</label>
    <input name="email_title" value=${getCfg('email_title')} type="text" />
    <button onClick=${() => update('email_title')}>Update</button>

    <label>Email Content</label>
    <textarea name="email">${getCfg('email')}</textarea>
    <button onClick=${() => update('email')}>Update</button>
  `;
}

function bootstrap() {
  const mountpt = document.getElementById('app');
  if (!mountpt) return;

  render(html`<${Main} />`, mountpt);
}

document.addEventListener('DOMContentLoaded', bootstrap);