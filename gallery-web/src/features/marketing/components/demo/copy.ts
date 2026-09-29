// Interactive demo copy (EN/HE), follows the landing's language toggle.
export const DEMO_COPY = {
  en: {
    title: 'Try it live', sub: 'Load sample photos or drop yours. Full screen experience.',
    loadSample: 'Load sample photos', chooseFiles: 'Choose files',
    allPhotos: 'All Photos', topPicks: 'Top Picks', sections: 'Sections', newSection: 'New section...',
    stories: 'Create Story', instagram: 'IG Grid', publish: 'Publish',
    published: 'Published!', backToEditor: 'Back', backToGrid: '← Back',
    storiesTitle: 'AI Story Generator', storiesMin: 'Mark at least 3 top picks with T',
    style: 'Style', duration: 'Duration',
    igHint: 'Tap to split, drag to reorder', igExportAll: 'Export all posts', igExporting: 'Exporting...',
    resetSplits: 'Reset splits',
    photos: 'photos', selected: 'selected', picks: 'picks',
    hint: 'Click = Select · T = Top Pick (jumps to top) · Drag to reorder',
    exitDemo: 'Exit demo',
    storyNote: 'Preview · Download the app for full quality video export',
  },
  he: {
    title: 'תנסה בלייב', sub: 'טען תמונות דוגמה או גרור משלך. חוויה מלאה.',
    loadSample: 'טען דוגמאות', chooseFiles: 'בחר קבצים',
    allPhotos: 'כל התמונות', topPicks: 'מועדפים', sections: 'סקשנים', newSection: 'סקשן חדש...',
    stories: 'צור סטורי', instagram: 'גריד IG', publish: 'פרסם',
    published: 'פורסם!', backToEditor: 'חזרה', backToGrid: '← חזרה',
    storiesTitle: 'מחולל סטוריז AI', storiesMin: 'סמן לפחות 3 מועדפים עם T',
    style: 'סגנון', duration: 'משך',
    igHint: 'לחץ תמונה לפיצול, גרור לסידור', igExportAll: 'ייצא הכל', igExporting: 'מייצא...',
    resetSplits: 'אפס פיצולים',
    photos: 'תמונות', selected: 'נבחרו', picks: 'מועדפים',
    hint: 'לחיצה = בחירה · T = מועדף (קופץ למעלה) · גרור לסידור',
    exitDemo: 'צא מהדמו',
    storyNote: 'תצוגה מקדימה · הורד את האפליקציה לייצוא וידאו באיכות מלאה',
  },
}

export type DemoLang = keyof typeof DEMO_COPY
export type DemoCopy = (typeof DEMO_COPY)[DemoLang]
