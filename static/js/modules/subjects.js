// ============================================
// SUBJECTS.JS — Subject group/config constants
// and helpers for resolving a student's subjects.
// Shared by results.js, students.js, classes.js.
// ============================================


// ============================================
// SUBJECT GROUPS CONFIGURATION
// ============================================
const SUBJECT_GROUPS = {
    'Science Group': [
        { name: 'Physics', max_marks: 100 },
        { name: 'Chemistry', max_marks: 100 },
        { name: 'Biology', max_marks: 100 },
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Practical Physics', max_marks: 50 },
        { name: 'Practical Chemistry', max_marks: 50 },
        { name: 'Practical Biology', max_marks: 50 }
    ],
    'Arts Group': [
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'History', max_marks: 100 },
        { name: 'Geographic', max_marks: 100 },
        { name: 'Pak Study', max_marks: 100 },
        { name: 'Punjabi', max_marks: 100 },
        { name: 'Fine Arts', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 }
    ],
    'Commerce Group': [
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Accounting', max_marks: 100 },
        { name: 'Economics', max_marks: 100 },
        { name: 'Business Studies', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Statistics', max_marks: 100 }
    ],
    'All Subjects': [
        { name: 'Mathematics', max_marks: 100 },
        { name: 'English', max_marks: 100 },
        { name: 'Urdu', max_marks: 100 },
        { name: 'Islamiat', max_marks: 100 },
        { name: 'Science', max_marks: 100 },
        { name: 'Computer Science', max_marks: 100 },
        { name: 'Physics', max_marks: 100 },
        { name: 'Chemistry', max_marks: 100 },
        { name: 'Biology', max_marks: 100 },
        { name: 'History', max_marks: 100 },
        { name: 'Geographic', max_marks: 100 },
        { name: 'Pak Study', max_marks: 100 },
        { name: 'Punjabi', max_marks: 100 },
        { name: 'Accounting', max_marks: 100 },
        { name: 'Economics', max_marks: 100 },
        { name: 'Business Studies', max_marks: 100 },
        { name: 'Fine Arts', max_marks: 100 },
        { name: 'Statistics', max_marks: 100 }
    ]
};

// Individual quick add subjects (shown as chips)
const QUICK_SUBJECTS = [
    { name: 'Mathematics', max: 100 },
    { name: 'English', max: 100 },
    { name: 'Urdu', max: 100 },
    { name: 'Islamiat', max: 100 },
    { name: 'Physics', max: 100 },
    { name: 'Chemistry', max: 100 },
    { name: 'Biology', max: 100 },
    { name: 'Computer Science', max: 100 },
    { name: 'History', max: 100 },
    { name: 'Geographic', max: 100 },
    { name: 'Pak Study', max: 100 },
    { name: 'Accounting', max: 100 },
    { name: 'Economics', max: 100 },
    { name: 'Business Studies', max: 100 },
    { name: 'Practical Physics', max: 50 },
    { name: 'Practical Chemistry', max: 50 },
    { name: 'Practical Biology', max: 50 },
    { name: 'Fine Arts', max: 100 },
    { name: 'Punjabi', max: 100 },
    { name: 'Statistics', max: 100 },
    { name: 'Education', max: 100 },
    { name: 'Psychology', max: 100 },
    { name: 'Sociology', max: 100 },
    { name: 'Civics', max: 100 }
];
// ============================================
// GLOBAL SUBJECT LIST (for dropdown fallback)
// ============================================
window.ALL_SCHOOL_SUBJECTS = [
    "Biology", "Chemistry", "Computer", "Computer Science", "English",
    "Geographic", "History", "Islamiat Elective", "Islamiat", "Math Elective",
    "Mathematics", "Pak Study", "Physics", "Punjabi (B)", "Science", "Urdu"
];

// ============================================
// SUBJECT DROPDOWN (for Result Modal)
// ============================================
async function getSubjectsForStudent(studentId) {
    try {
        console.log('🔍 Getting subjects for student:', studentId);
        
        const student = await fetchAPI(`/students/${studentId}`);
        console.log('📚 Student data:', student);
        
        if (!student || !student.grade) {
            console.warn('❌ Student has no grade');
            return [];
        }
        
        let gradeName = student.grade.trim();
        console.log('📖 Student grade:', gradeName);
        
        const classesData = await fetchAPI('/classes');
        console.log('🏫 All classes:', classesData.classes.map(c => c.class_name));
        
        // Try multiple matching strategies
        let matchedClass = null;
        
        // Strategy 1: startsWith
        matchedClass = classesData.classes.find(c => 
            c.class_name.toLowerCase().startsWith(gradeName.toLowerCase())
        );
        if (matchedClass) {
            console.log('✅ Matched using startsWith:', matchedClass.class_name);
        }
        
        // Strategy 2: includes
        if (!matchedClass) {
            matchedClass = classesData.classes.find(c => 
                c.class_name.toLowerCase().includes(gradeName.toLowerCase())
            );
            if (matchedClass) {
                console.log('✅ Matched using includes:', matchedClass.class_name);
            }
        }
        
        // Strategy 3: extract numbers
        if (!matchedClass) {
            const gradeNum = gradeName.match(/\d+/);
            if (gradeNum) {
                matchedClass = classesData.classes.find(c => {
                    const classNum = c.class_name.match(/\d+/);
                    return classNum && classNum[0] === gradeNum[0];
                });
                if (matchedClass) {
                    console.log('✅ Matched using number extraction:', matchedClass.class_name);
                }
            }
        }
        
        if (!matchedClass) {
            console.error('❌ No class found for grade:', gradeName);
            console.log('💡 Available classes:', classesData.classes.map(c => c.class_name).join(', '));
            showAlert(
                `No class found for grade "${gradeName}". Available classes: ${classesData.classes.map(c => c.class_name).join(', ')}`,
                'error'
            );
            return [];
        }
        
        console.log('✅ Matched class:', matchedClass);
        
        const subjectsData = await fetchAPI(`/classes/${matchedClass.id}/subjects`);
        console.log('📚 Subjects for class:', subjectsData.subjects);
        
        return subjectsData.subjects || [];
        
    } catch (error) {
        console.error('❌ Failed loading subjects:', error);
        showAlert('Error loading subjects. Please try again.', 'error');
        return [];
    }
}
/**
 * Find and fix students whose grade doesn't match any class
 */
async function fixUnmatchedStudentGrades() {
    try {
        // 1. Get all students and classes
        const [studentsData, classesData] = await Promise.all([
            fetchAPI('/students'),
            fetchAPI('/classes')
        ]);

        const students = studentsData.students || [];
        const classes = classesData.classes || [];

        // 2. Build class name lookup with multiple variations
        const classLookup = new Map();
        classes.forEach(cls => {
            const variations = [
                cls.class_name,
                cls.class_name.toLowerCase(),
                cls.class_name.replace(/Grade\s*/i, '').trim(),
                cls.class_name.replace(/Class\s*/i, '').trim(),
                cls.class_name.replace(/[-\s]/g, ''),
                extractNumber(cls.class_name) ? `Grade ${extractNumber(cls.class_name)}` : null
            ].filter(Boolean);

            variations.forEach(v => {
                if (!classLookup.has(v)) {
                    classLookup.set(v, cls.class_name);
                }
            });
        });

        // 3. Check each student
        let fixedCount = 0;
        const fixes = [];

        for (const student of students) {
            const grade = student.grade.trim();
            const variations = [
                grade,
                grade.toLowerCase(),
                grade.replace(/Grade\s*/i, '').trim(),
                grade.replace(/Class\s*/i, '').trim(),
                grade.replace(/[-\s]/g, ''),
                extractNumber(grade) ? `Grade ${extractNumber(grade)}` : null
            ].filter(Boolean);

            // Check if any variation matches a class
            const hasMatch = variations.some(v => classLookup.has(v));

            if (!hasMatch) {
                // Try to find the closest class by number
                const gradeNum = extractNumber(grade);
                let suggestedClass = null;

                if (gradeNum) {
                    // Look for a class with the same number
                    suggestedClass = classes.find(c => 
                        extractNumber(c.class_name) === gradeNum
                    );
                }

                fixes.push({
                    student: student.name,
                    currentGrade: grade,
                    suggestedClass: suggestedClass?.class_name || 'No match found'
                });
                
                fixedCount++;
            }
        }

        // 4. Show results
        if (fixedCount > 0) {
            let message = `Found ${fixedCount} students with mismatched grades:\n\n`;
            fixes.forEach(f => {
                message += `• ${f.student}: "${f.currentGrade}" → suggested: "${f.suggestedClass}"\n`;
            });
            message += '\nWould you like to auto-fix these? (Update student grades to match suggested classes)';
            
            // You can implement the auto-fix logic here
            console.log('Mismatched students:', fixes);
        } else {
            showAlert('All students have matching grades!', 'success');
        }

        return fixes;

    } catch (error) {
        console.error('Error fixing grades:', error);
        showAlert('Failed to check student grades', 'error');
    }
}

