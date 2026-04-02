export interface EntryTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const templates: EntryTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start with a clean slate",
    content: "",
  },
  {
    id: "gratitude",
    name: "Gratitude",
    description: "Reflect on what you're thankful for",
    content: `<h2>Gratitude</h2>
<p>Three things I'm grateful for today:</p>
<ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>
<h2>Why These Matter</h2>
<p></p>`,
  },
  {
    id: "daily-review",
    name: "Daily Review",
    description: "Review your day and plan ahead",
    content: `<h2>Today's Highlights</h2>
<p></p>
<h2>What Went Well</h2>
<p></p>
<h2>What Could Be Improved</h2>
<p></p>
<h2>Tomorrow's Priorities</h2>
<ul><li><p></p></li><li><p></p></li><li><p></p></li></ul>`,
  },
  {
    id: "morning-pages",
    name: "Morning Pages",
    description: "Stream of consciousness writing",
    content: `<h2>Morning Pages</h2>
<p>Write freely for a few minutes. Don't edit, don't judge — just let the words flow.</p>
<p></p>`,
  },
  {
    id: "weekly-reflection",
    name: "Weekly Reflection",
    description: "Look back on your week",
    content: `<h2>This Week in Review</h2>
<h3>Key Accomplishments</h3>
<ul><li><p></p></li></ul>
<h3>Challenges Faced</h3>
<p></p>
<h3>Lessons Learned</h3>
<p></p>
<h3>Goals for Next Week</h3>
<ul><li><p></p></li></ul>`,
  },
];
