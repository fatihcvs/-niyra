"""Keep a selected curriculum's label tied to its exact public response."""
import re
from bs4 import BeautifulSoup


def selected_oibs_curriculum(body):
    # Parse only the public selector, not the thousands of course table cells.
    for block in re.findall(r'<select\b[^>]*>.*?</select\s*>',body,re.I|re.S):
        selector=BeautifulSoup(block,'html.parser').select_one('select#cmbYillar')
        if selector is None:continue
        selected=selector.select('option[selected]')
        if len(selected)!=1:return None
        option=selected[0];value=option.get('value');label=' '.join(option.get_text(' ',strip=True).split())
        if not value or not label:return None
        return {'curriculumPeriod':label,'sourceSelection':{'cmbYillar':value}}
    return None


def retain_matching_metadata(record,previous):
    """A shared URL is not proof of a shared WebForms curriculum."""
    if not previous or record.get('sourceHash')!=previous.get('sourceHash'):return record
    for key in ['curriculumPeriod','sourceSelection']:
        if key not in record and key in previous:record[key]=previous[key]
    return record
