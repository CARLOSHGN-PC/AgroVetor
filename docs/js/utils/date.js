export function timeSince(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " dias atrás";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas atrás";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutos atrás";
    return "Agora mesmo";
}

export function formatDateForInput(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return '';
    }
    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - (offset*60*1000));
    return adjustedDate.toISOString().split('T')[0];
}

export function formatDateForDisplay(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T03:00:00Z');
    if (isNaN(date.getTime())) {
        return 'Data Inválida';
    }
    return date.toLocaleDateString('pt-BR');
}
