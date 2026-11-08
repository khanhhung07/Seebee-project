'use strict';
const launch = document.getElementById('launch');
launch.addEventListener('click', () => globalThis.__TARGETLENS_V1__.open());
const articleList = [
  ['Designing for the edges', 'Maya Chen', 'Design', '2026'],
  ['The quiet power of good defaults', 'Jordan Lee', 'Interfaces', '2026'],
  ['A more human internet', 'Sam Rivera', 'Technology', '2025'],
  ['When a button becomes a barrier', 'Alex Morgan', 'Access', '2025'],
  ['Small interactions, bigger possibilities', 'Taylor Park', 'Design', '2025'],
  ['Beyond the perfect user', 'Casey Brooks', 'Research', '2024'],
  ['Making room for different hands', 'Riley Singh', 'Access', '2024'],
  ['The case for readable controls', 'Quinn Davis', 'Interfaces', '2024'],
  ['Listening as a design practice', 'Avery Kim', 'Research', '2023'],
  ['Tools that meet us where we are', 'Jamie Ellis', 'Technology', '2023'],
  ['The shape of a kinder interface', 'Robin Lane', 'Design', '2023'],
  ['More ways to participate', 'Drew Patel', 'Access', '2022']
];
let page = 0, reverse = false;
const feedback = document.getElementById('feedback');
function renderArticles() {
  const container = document.getElementById('articles');
  container.replaceChildren();
  let visible = articleList.slice(page * 4, page * 4 + 4);
  if (reverse) visible.reverse();
  visible.forEach(([title, author, topic, year], offset) => {
    const row = document.createElement('div'); row.className = 'article-row';
    const summary = document.createElement('div');
    const heading = document.createElement('div'); heading.className = 'article-name'; heading.textContent = title;
    const byline = document.createElement('div'); byline.className = 'article-author'; byline.textContent = author;
    summary.append(heading, byline);
    const tag = document.createElement('span'); tag.className = 'topic'; tag.textContent = topic;
    const date = document.createElement('span'); date.className = 'year'; date.textContent = year;
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const read = document.createElement('a'); read.href = '#feedback'; read.textContent = 'Read'; read.setAttribute('aria-label', `Read ${title}`);
    read.addEventListener('click', () => { feedback.textContent = `Opened “${title}”. This is a sample article in the local demo.`; });
    const save = document.createElement('button'); save.textContent = 'Save'; save.setAttribute('aria-label', `Save ${title}`);
    const helper = document.createElement('span'); helper.className = 'sr'; helper.id = `save-help-${page}-${offset}`; helper.textContent = `Adds “${title}” to your saved reading list in this demonstration.`;
    save.setAttribute('aria-describedby', helper.id);
    save.addEventListener('click', () => {
      const saved = save.textContent === 'Save'; save.textContent = saved ? 'Saved' : 'Save';
      save.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${title}`);
      helper.textContent = `${saved ? 'Removes' : 'Adds'} “${title}” ${saved ? 'from' : 'to'} your saved reading list in this demonstration.`;
      feedback.textContent = `${saved ? 'Saved' : 'Unsaved'} “${title}”.`;
    });
    actions.append(read, save, helper); row.append(summary, tag, date, actions); container.append(row);
  });
  document.getElementById('page-status').textContent = `Showing ${page * 4 + 1}–${page * 4 + 4} of 12 articles`;
  document.getElementById('page-number').textContent = `0${page + 1} / 03`;
  document.getElementById('previous').disabled = page === 0;
  document.getElementById('next').disabled = page === 2;
}
document.getElementById('next').addEventListener('click', () => { if (page < 2) { page++; renderArticles(); feedback.textContent = `Moved to page ${page + 1}.`; } });
document.getElementById('previous').addEventListener('click', () => { if (page > 0) { page--; renderArticles(); feedback.textContent = `Moved to page ${page + 1}.`; } });
document.getElementById('sort').addEventListener('click', event => { reverse = !reverse; event.target.textContent = reverse ? 'Sort: reversed' : 'Sort: newest'; renderArticles(); });
document.getElementById('download').addEventListener('click', () => {
  const titles = [...document.querySelectorAll('.article-name')].map(el => el.textContent).join('\n');
  const url = URL.createObjectURL(new Blob([`Fieldnotes reading list\n\n${titles}\n`], {type: 'text/plain'}));
  const link = document.createElement('a'); link.href = url; link.download = 'fieldnotes-reading-list.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); feedback.textContent = 'Downloaded the reading list for this page.';
});
renderArticles();
