from tests.factories import (
    ReportFactory,
    ReportFormatTemplateFactory,
    ReportInputFactory,
    ReportTemplateFactory,
    ReportWorkerFactory,
    TargetInstrumentFactory,
    UsedPartFactory,
)

factories = [
    ReportFactory,
    ReportInputFactory,
    ReportTemplateFactory,
    ReportFormatTemplateFactory,
    TargetInstrumentFactory,
    ReportWorkerFactory,
    UsedPartFactory,
]

for F in factories:
    print(F.__name__)
    fields = {f.name for f in F.get_model_fields()}
    print(sorted(list(fields)))
    print()
